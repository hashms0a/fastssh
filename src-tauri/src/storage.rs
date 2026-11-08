//! Atomic JSON persistence: settings.json + hosts/accounts/bookmarks.
//!
//! Each of the three library files also has a GPG form, `<name>.json.gpg`
//! (Stage 10). Which form is read and written is decided by
//! `settings.encryptData` plus the passphrase in `LibraryCrypto`; `settings.json`
//! is never encrypted.

use crate::error::AppError;
use crate::models::{Account, Bookmark, Host};
use crate::paths;
use crate::settings::AppSettings;
use serde::Serialize;
use serde_json::Value;
use std::{fs, io::Write, os::unix::fs::PermissionsExt, path::PathBuf};

mod library;
mod settings_io;
pub(crate) use library::data_dir;
pub use library::{load_all, report_from, save_accounts, save_bookmarks, save_hosts};
pub use settings_io::{
    load_settings, load_settings_from, load_settings_with_warnings, save_settings,
    save_settings_to, settings_path,
};

/// The three files that make up the library (`hosts_folder` shares them).
pub const LIBRARY_FILES: [&str; 3] = ["hosts.json", "accounts.json", "bookmarks.json"];

/// The three library collections, in file order.
pub type Library = (Vec<Host>, Vec<Account>, Vec<Bookmark>);

/// Move a file aside as `<name>.json.corrupt-<unix-ts>`, keeping its bytes.
pub(crate) fn rename_aside(path: &std::path::Path, warnings: &mut Vec<String>) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // The existing extension stays in the name, so `hosts.json` becomes
    // `hosts.json.corrupt-<ts>` and `hosts.json.gpg` keeps its `.gpg`.
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("json");
    let aside = path.with_extension(format!("{ext}.corrupt-{ts}"));
    match fs::rename(path, &aside) {
        Ok(()) => warnings.push(format!(
            "{} could not be read and was moved to {}",
            path.display(),
            aside.display()
        )),
        Err(e) => warnings.push(format!(
            "{} could not be read and could not be renamed ({}), leaving it in place",
            path.display(),
            e
        )),
    }
}

pub fn atomic_write(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| std::io::Error::other("no parent dir"))?;
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?; // same FS => atomic rename
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.as_file()
        .set_permissions(fs::Permissions::from_mode(0o600))?;
    tmp.persist(path).map_err(|e| e.error)?;
    fs::File::open(dir)?.sync_all()?; // persist the rename
    Ok(())
}

/// Parse library text as a JSON array. Anything else is renamed aside with a
/// warning; never panics. `path` is the file the text came from (plain or
/// decrypted), so the message and the rename name the right file.
pub fn parse_array(text: &str, path: &std::path::Path, warnings: &mut Vec<String>) -> Vec<Value> {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Array(a)) => a,
        Ok(_) => {
            warnings.push(format!("{} is not a JSON array", path.display()));
            rename_aside(path, warnings);
            vec![]
        }
        Err(e) => {
            warnings.push(format!("{}: {e}", path.display()));
            rename_aside(path, warnings);
            vec![]
        }
    }
}

/// Missing => empty; anything that is not a JSON array is renamed aside
/// with a warning; never panics.
pub fn read_array(path: &std::path::Path, warnings: &mut Vec<String>) -> Vec<Value> {
    let Ok(text) = fs::read_to_string(path) else {
        return vec![];
    };
    parse_array(&text, path, warnings)
}

/// The folder holding the three data files.
/// The default hostsFolder follows the config dir (sandbox-friendly);
/// any other value is expanded from ~ and created if missing.
pub fn data_dir_for(
    hosts_folder: &str,
    fallback: &std::path::Path,
    warnings: &mut Vec<String>,
) -> PathBuf {
    let default_folder = AppSettings::default().hosts_folder;
    let dir = if hosts_folder == default_folder {
        fallback.to_path_buf()
    } else {
        paths::expand_tilde(hosts_folder)
    };
    match fs::create_dir_all(&dir) {
        Ok(()) => {
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
            dir
        }
        Err(e) => {
            warnings.push(format!(
                "Data folder {} could not be created ({e}); using {}",
                dir.display(),
                fallback.display()
            ));
            fallback.to_path_buf()
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadReport {
    pub hosts: Vec<Host>,
    pub accounts: Vec<Account>,
    pub bookmarks: Vec<Bookmark>,
    pub settings: AppSettings,
    pub warnings: Vec<String>,
    pub locked: bool,
    pub legacy_available: bool,
    /// How many records the legacy `hosts.json` holds (Stage 10, task 10.7):
    /// the WelcomeView button names the count before anything is imported.
    pub legacy_hosts: usize,
}

/// One shared config-dir entry point for load_all and the save commands:
/// make sure it exists as mode 0700.
fn ensure_config_dir() -> Result<PathBuf, AppError> {
    let dir = paths::config_dir();
    fs::create_dir_all(&dir).map_err(|e| AppError::io(&dir, e))?;
    let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    Ok(dir)
}

/// Ensure a data file uses the documented 0600 mode (fixtures copied into
/// the sandbox may carry 664 from the source folder).
fn ensure_file_mode(path: &std::path::Path) {
    if path.exists() {
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
}

#[cfg(test)]
mod tests;
