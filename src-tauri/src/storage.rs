//! Atomic JSON persistence: settings.json + hosts/accounts/bookmarks.

use crate::error::AppError;
use crate::models::{self, Account, Bookmark, Host};
use crate::paths;
use crate::settings::{self, AppSettings};
use serde::Serialize;
use serde_json::Value;
use std::{fs, io::Write, os::unix::fs::PermissionsExt, path::PathBuf};

/// Move a file aside as `<name>.json.corrupt-<unix-ts>`, keeping its bytes.
fn rename_aside(path: &std::path::Path, warnings: &mut Vec<String>) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let aside = path.with_extension(format!("json.corrupt-{ts}"));
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

/// Missing => empty; anything that is not a JSON array is renamed aside
/// with a warning; never panics.
pub fn read_array(path: &std::path::Path, warnings: &mut Vec<String>) -> Vec<Value> {
    let Ok(text) = fs::read_to_string(path) else {
        return vec![];
    };
    match serde_json::from_str::<Value>(&text) {
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

pub fn settings_path() -> PathBuf {
    paths::config_dir().join("settings.json")
}

/// Sync, tolerant read of settings.json (used by lib.rs before the window
/// is built and by load_all).
pub fn load_settings() -> AppSettings {
    load_settings_with_warnings(&mut vec![])
}

pub fn load_settings_with_warnings(warnings: &mut Vec<String>) -> AppSettings {
    load_settings_from(&settings_path(), warnings)
}

fn load_settings_from(path: &std::path::Path, warnings: &mut Vec<String>) -> AppSettings {
    let Ok(text) = fs::read_to_string(path) else {
        return AppSettings::default();
    };
    if text.trim().is_empty() {
        return AppSettings::default();
    }
    match serde_json::from_str::<Value>(&text) {
        Ok(v) => settings::settings_from_value(v),
        Err(e) => {
            warnings.push(format!("{}: {e}", path.display()));
            rename_aside(path, warnings);
            AppSettings::default()
        }
    }
}

pub fn save_settings(s: &AppSettings) -> Result<(), AppError> {
    save_settings_to(&settings_path(), s)
}

pub fn save_settings_to(path: &std::path::Path, s: &AppSettings) -> Result<(), AppError> {
    let bytes = serde_json::to_vec_pretty(s).map_err(|e| AppError::json(path, e))?;
    atomic_write(path, &bytes).map_err(|e| AppError::io(path, e))
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

/// Read the three library files of one folder.
fn read_library(
    dir: &std::path::Path,
    warnings: &mut Vec<String>,
) -> (Vec<Host>, Vec<Account>, Vec<Bookmark>) {
    for name in ["hosts.json", "accounts.json", "bookmarks.json"] {
        ensure_file_mode(&dir.join(name));
    }
    let mut hosts = vec![];
    for v in read_array(&dir.join("hosts.json"), warnings) {
        if let Some(h) = models::host_from_value(&v, warnings) {
            hosts.push(h);
        }
    }
    let mut accounts = vec![];
    for v in read_array(&dir.join("accounts.json"), warnings) {
        if let Some(a) = models::account_from_value(&v, warnings) {
            accounts.push(a);
        }
    }
    let mut bookmarks = vec![];
    for v in read_array(&dir.join("bookmarks.json"), warnings) {
        if let Some(b) = models::bookmark_from_value(&v, warnings) {
            bookmarks.push(b);
        }
    }
    (hosts, accounts, bookmarks)
}

/// The library of one folder under the given settings (task 8.3 also uses
/// this, for the folder the user just picked).
pub fn report_from(dir: &std::path::Path, settings: AppSettings) -> LoadReport {
    let mut warnings = vec![];
    let (hosts, accounts, bookmarks) = read_library(dir, &mut warnings);
    for w in &warnings {
        log::warn!("load: {w}");
    }
    LoadReport {
        hosts,
        accounts,
        bookmarks,
        settings,
        warnings,
        locked: false, // Stage 10: true when a *.json.gpg needs unlocking
        legacy_available: paths::legacy_dir().join("hosts.json").exists(),
    }
}

pub fn load_all() -> LoadReport {
    let mut warnings = vec![];
    let config_dir = match ensure_config_dir() {
        Ok(d) => d,
        Err(e) => {
            warnings.push(e.message);
            paths::config_dir()
        }
    };
    ensure_file_mode(&config_dir.join("settings.json"));
    let settings = load_settings_with_warnings(&mut warnings);
    let dir = data_dir_for(&settings.hosts_folder, &config_dir, &mut warnings);
    let mut report = report_from(&dir, settings);
    report.warnings.extend(warnings);
    for w in &report.warnings {
        log::warn!("load_all: {w}");
    }
    report
}

fn write_array<T>(
    path: &std::path::Path,
    items: &[T],
    to_value: fn(&T) -> Value,
) -> Result<(), AppError> {
    atomic_write(path, &models::to_json_array(items, to_value)).map_err(|e| AppError::io(path, e))
}

fn data_dir(settings: &AppSettings) -> Result<PathBuf, AppError> {
    let mut warnings = vec![];
    let dir = data_dir_for(&settings.hosts_folder, &ensure_config_dir()?, &mut warnings);
    for w in warnings {
        log::warn!("save: {w}");
    }
    Ok(dir)
}

pub fn save_hosts(settings: &AppSettings, hosts: &[Host]) -> Result<(), AppError> {
    let owned: Vec<Host> = hosts
        .iter()
        .filter(|h| h.local != Some(true))
        .cloned()
        .collect();
    write_array(
        &data_dir(settings)?.join("hosts.json"),
        &owned,
        models::host_to_value,
    )
}

pub fn save_accounts(settings: &AppSettings, accounts: &[Account]) -> Result<(), AppError> {
    write_array(
        &data_dir(settings)?.join("accounts.json"),
        accounts,
        models::account_to_value,
    )
}

pub fn save_bookmarks(settings: &AppSettings, bookmarks: &[Bookmark]) -> Result<(), AppError> {
    write_array(
        &data_dir(settings)?.join("bookmarks.json"),
        bookmarks,
        models::bookmark_to_value,
    )
}

#[cfg(test)]
mod tests;
