//! Task 8.3: point the library at another folder. Two modes:
//! "load" reads the library that already lives there, "copy" writes the
//! current library into it. Both return that folder's LoadReport so the
//! frontend can show the result; the settings write stays in the frontend
//! (`updateSettings` + the debounced save), which keeps one writer.

use crate::error::AppError;
use crate::paths;
use crate::settings::AppSettings;
use crate::storage::{self, LoadReport};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// The files that make up the library; each may also exist as `<name>.gpg`
/// once Stage 10 lands.
pub const LIBRARY_FILES: [&str; 3] = ["hosts.json", "accounts.json", "bookmarks.json"];

pub enum FolderMode {
    Load,
    Copy,
}

pub fn parse_mode(mode: &str) -> Result<FolderMode, AppError> {
    match mode {
        "load" => Ok(FolderMode::Load),
        "copy" => Ok(FolderMode::Copy),
        other => Err(AppError::new(
            "bad_request",
            format!("Unknown hosts folder mode \"{other}\" (use \"load\" or \"copy\")."),
        )),
    }
}

/// The directory a `hostsFolder` value names, without creating it. The
/// default value means "the config dir", like `storage::data_dir_for`.
pub fn library_dir(folder: &str) -> PathBuf {
    if folder == AppSettings::default().hosts_folder {
        paths::config_dir()
    } else {
        paths::expand_tilde(folder)
    }
}

/// True when the folder already holds a library (plain or encrypted).
pub fn has_library(folder: &str) -> bool {
    let dir = library_dir(folder);
    dir.join(LIBRARY_FILES[0]).exists() || dir.join(format!("{}.gpg", LIBRARY_FILES[0])).exists()
}

/// Resolve the folder and create it, turning the fallback warning of
/// `data_dir_for` into an error the UI can show.
fn target_dir(folder: &str) -> Result<PathBuf, AppError> {
    let mut warnings = vec![];
    let dir = storage::data_dir_for(folder, &paths::config_dir(), &mut warnings);
    match warnings.pop() {
        Some(w) => Err(AppError::new(
            "io",
            format!("{w} Check the path and its permissions."),
        )),
        None => Ok(dir),
    }
}

/// The plain file, or its `.gpg` variant when only that exists.
fn source_file(from: &Path, name: &str) -> Option<PathBuf> {
    let plain = from.join(name);
    if plain.exists() {
        return Some(plain);
    }
    let gpg = from.join(format!("{name}.gpg"));
    if gpg.exists() { Some(gpg) } else { None }
}

/// Copy the library into `to`, keeping `.gpg` names, and give every file the
/// documented 0600 mode. A file missing on the source becomes an empty array
/// so the target always holds all three.
fn copy_library(from: &Path, to: &Path) -> Result<(), AppError> {
    if from == to {
        return Ok(());
    }
    fs::create_dir_all(to).map_err(|e| AppError::io(to, e))?;
    let _ = fs::set_permissions(to, fs::Permissions::from_mode(0o700));
    for name in LIBRARY_FILES {
        let src = source_file(from, name);
        let dest = match &src {
            Some(p) => to.join(p.file_name().unwrap_or_default()),
            None => to.join(name),
        };
        match src {
            Some(p) => {
                fs::copy(&p, &dest).map_err(|e| AppError::io(&dest, e))?;
            }
            None => storage::atomic_write(&dest, b"[]")?,
        }
        fs::set_permissions(&dest, fs::Permissions::from_mode(0o600))
            .map_err(|e| AppError::io(&dest, e))?;
    }
    Ok(())
}

pub fn set_hosts_folder(
    current: &AppSettings,
    folder: &str,
    mode: &str,
) -> Result<LoadReport, AppError> {
    let mode = parse_mode(mode)?;
    let folder = folder.trim();
    if folder.is_empty() {
        return Err(AppError::new(
            "bad_request",
            "The hosts folder is empty. Type a path or pick one with Browse.",
        ));
    }
    let to = target_dir(folder)?;
    let settings = AppSettings {
        hosts_folder: folder.to_string(),
        ..current.clone()
    };
    match mode {
        FolderMode::Copy => {
            let from =
                storage::data_dir_for(&current.hosts_folder, &paths::config_dir(), &mut vec![]);
            copy_library(&from, &to)?;
            // Never log file contents; the folder and the count only.
            log::info!(
                "set_hosts_folder mode=copy from={} to={}",
                from.display(),
                to.display()
            );
        }
        FolderMode::Load => {
            if !has_library(folder) {
                return Err(AppError::new(
                    "no_library",
                    format!(
                        "{} contains no hosts.json. Pick another folder, or copy the current library there.",
                        to.display()
                    ),
                ));
            }
            log::info!("set_hosts_folder mode=load from={}", to.display());
        }
    }
    Ok(storage::report_from(&to, settings))
}

#[cfg(test)]
mod tests;
