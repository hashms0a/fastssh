//! hosts.json, accounts.json, bookmarks.json: read (plain or `.gpg`) and
//! written (plain, or encrypted when `encryptData` is on and the passphrase is
//! held), plus the `LoadReport` the frontend hydrates from.

use super::{
    LIBRARY_FILES, Library, LoadReport, data_dir_for, ensure_config_dir, ensure_file_mode,
    load_settings_with_warnings, parse_array, read_array, take_boot_warnings,
};
use crate::crypto::{self, LibraryCrypto};
use crate::error::AppError;
use crate::models::{self, Account, Bookmark, Host};
use crate::paths;
use crate::settings::AppSettings;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// One library file's records, from the plain file or from its `.gpg` twin.
/// An unreadable encrypted file is a hard error (`crypto` maps the gpg error),
/// because silently returning an empty list here would overwrite the library
/// on the next save.
fn read_file_values(
    dir: &std::path::Path,
    name: &str,
    warnings: &mut Vec<String>,
    crypto: &LibraryCrypto,
) -> Result<Vec<Value>, AppError> {
    let plain = dir.join(name);
    if plain.exists() {
        return Ok(read_array(&plain, warnings));
    }
    let enc = dir.join(crypto::gpg_name(name));
    if !enc.exists() {
        return Ok(vec![]);
    }
    let bytes = crypto::read_bytes(&enc, crypto)?;
    let text = String::from_utf8(bytes).map_err(|_| {
        AppError::new(
            "gpg",
            format!("{} decrypted to data that is not UTF-8", enc.display()),
        )
    })?;
    Ok(parse_array(&text, &enc, warnings))
}

/// Read the three library files of one folder.
fn read_library(
    dir: &std::path::Path,
    warnings: &mut Vec<String>,
    crypto: &LibraryCrypto,
) -> Result<Library, AppError> {
    for name in LIBRARY_FILES {
        ensure_file_mode(&dir.join(name));
        ensure_file_mode(&dir.join(crypto::gpg_name(name)));
    }
    let mut hosts = vec![];
    for v in read_file_values(dir, "hosts.json", warnings, crypto)? {
        if let Some(h) = models::host_from_value(&v, warnings) {
            hosts.push(h);
        }
    }
    let mut accounts = vec![];
    for v in read_file_values(dir, "accounts.json", warnings, crypto)? {
        if let Some(a) = models::account_from_value(&v, warnings) {
            accounts.push(a);
        }
    }
    let mut bookmarks = vec![];
    for v in read_file_values(dir, "bookmarks.json", warnings, crypto)? {
        if let Some(b) = models::bookmark_from_value(&v, warnings) {
            bookmarks.push(b);
        }
    }
    Ok((hosts, accounts, bookmarks))
}

/// What the legacy EasySSH folder holds, read without writing anything (R5).
fn legacy_stats() -> (bool, usize) {
    let path = paths::legacy_dir().join("hosts.json");
    if !path.exists() {
        return (false, 0);
    }
    let count = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|v| v.as_array().map(|a| a.len()))
        .unwrap_or(0);
    (true, count)
}

/// The library of one folder under the given settings (task 8.3 also uses
/// this, for the folder the user just picked).
///
/// Task 10.2: when an encrypted file exists and no passphrase is held, the
/// report is `locked` with empty lists, which is what makes the UI show the
/// unlock modal instead of an empty library.
pub fn report_from(
    dir: &std::path::Path,
    settings: AppSettings,
    crypto: &LibraryCrypto,
) -> Result<LoadReport, AppError> {
    let mut warnings = vec![];
    let mut locked = false;
    let (hosts, accounts, bookmarks) =
        if crypto.passphrase().is_none() && crypto::has_encrypted(dir) {
            locked = true;
            // One line, not one per file: the unlock modal is on screen and
            // says this already, so a stack of red warnings adds nothing.
            let names: Vec<String> = LIBRARY_FILES
                .iter()
                .filter(|n| dir.join(crypto::gpg_name(n)).exists())
                .map(|n| crypto::gpg_name(n))
                .collect();
            warnings.push(format!(
                "{} encrypted file{} ({}); enter the passphrase to open {}",
                names.len(),
                if names.len() == 1 { " is" } else { "s are" },
                names.join(", "),
                if names.len() == 1 { "it" } else { "them" },
            ));
            (vec![], vec![], vec![])
        } else {
            read_library(dir, &mut warnings, crypto)?
        };
    for w in &warnings {
        log::warn!("load: {w}");
    }
    let (legacy_available, legacy_hosts) = legacy_stats();
    Ok(LoadReport {
        hosts,
        accounts,
        bookmarks,
        settings,
        warnings,
        locked,
        legacy_available,
        legacy_hosts,
    })
}

pub fn load_all(crypto: &LibraryCrypto) -> Result<LoadReport, AppError> {
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
    let mut report = report_from(&dir, settings, crypto)?;
    report.warnings.extend(warnings);
    // Anything the pre-window settings read found (a corrupt file renamed
    // aside) belongs on screen too.
    report.warnings.extend(take_boot_warnings());
    for w in &report.warnings {
        log::warn!("load_all: {w}");
    }
    Ok(report)
}

fn write_array<T>(
    path: &std::path::Path,
    items: &[T],
    to_value: fn(&T) -> Value,
    settings: &AppSettings,
    crypto: &LibraryCrypto,
) -> Result<(), AppError> {
    crypto::write_file(
        path,
        &models::to_json_array(items, to_value),
        crypto,
        settings,
    )
}

pub(crate) fn data_dir(settings: &AppSettings) -> Result<PathBuf, AppError> {
    let mut warnings = vec![];
    let dir = data_dir_for(&settings.hosts_folder, &ensure_config_dir()?, &mut warnings);
    for w in warnings {
        log::warn!("save: {w}");
    }
    Ok(dir)
}

pub fn save_hosts(
    settings: &AppSettings,
    hosts: &[Host],
    crypto: &LibraryCrypto,
) -> Result<(), AppError> {
    let owned: Vec<Host> = hosts
        .iter()
        .filter(|h| h.local != Some(true))
        .cloned()
        .collect();
    write_array(
        &data_dir(settings)?.join("hosts.json"),
        &owned,
        models::host_to_value,
        settings,
        crypto,
    )
}

pub fn save_accounts(
    settings: &AppSettings,
    accounts: &[Account],
    crypto: &LibraryCrypto,
) -> Result<(), AppError> {
    write_array(
        &data_dir(settings)?.join("accounts.json"),
        accounts,
        models::account_to_value,
        settings,
        crypto,
    )
}

pub fn save_bookmarks(
    settings: &AppSettings,
    bookmarks: &[Bookmark],
    crypto: &LibraryCrypto,
) -> Result<(), AppError> {
    write_array(
        &data_dir(settings)?.join("bookmarks.json"),
        bookmarks,
        models::bookmark_to_value,
        settings,
        crypto,
    )
}
