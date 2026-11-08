//! Stage 11 (P2): back the whole library up into ONE JSON file, plain or
//! armored gpg. The three library files stay as they are; this writes a copy.
//!
//! The file is one object with the three arrays in the same record shape the
//! library files use, plus a header, so `jq` can read it and a future
//! "restore from a backup" can feed each array to the Stage 1 lenient parsers.
//! Nothing is overwritten: an existing target is refused with its path.

use crate::crypto::LibraryCrypto;
use crate::error::AppError;
use crate::models::{self, Account, Bookmark, Host};
use crate::paths;
use crate::settings::{AppSettings, SCHEMA_VERSION};
use crate::storage;
use serde::Serialize;
use serde_json::{Value, json};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

/// Subfolder of `hostsFolder` for automatic backups.
pub const BACKUP_DIR: &str = "backups";

/// What one export produced, for the toast.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub path: String,
    pub encrypted: bool,
    pub hosts: usize,
    pub accounts: usize,
    pub bookmarks: usize,
}

/// "YYYYMMDD-HHMMSS" in UTC from a Unix second, so backup names sort by time.
pub fn stamp(unix_secs: u64) -> String {
    let days = (unix_secs / 86_400) as i64;
    let secs = (unix_secs % 86_400) as u32;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

/// Days since 1970-01-01 -> (year, month, day) (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `fastssh-library-<stamp>.json`, or `.json.gpg` when the copy is encrypted.
pub fn file_name(stamp: &str, encrypted: bool) -> String {
    if encrypted {
        format!("fastssh-library-{stamp}.json.gpg")
    } else {
        format!("fastssh-library-{stamp}.json")
    }
}

/// The automatic backup folder: `<hostsFolder>/backups`.
pub fn backup_dir(settings: &AppSettings) -> Result<PathBuf, AppError> {
    let dir = storage::data_dir(settings)?.join(BACKUP_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::io(&dir, e))?;
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    Ok(dir)
}

/// The document: a header and the three arrays in the on-disk record shape.
pub fn payload(
    stamp: &str,
    hosts: &[Host],
    accounts: &[Account],
    bookmarks: &[Bookmark],
) -> Vec<u8> {
    let doc = json!({
        "app": "FastSSH",
        "schemaVersion": SCHEMA_VERSION,
        "exportedAt": stamp,
        "hosts": Value::Array(hosts.iter().map(models::host_to_value).collect()),
        "accounts": Value::Array(accounts.iter().map(models::account_to_value).collect()),
        "bookmarks": Value::Array(bookmarks.iter().map(models::bookmark_to_value).collect()),
    });
    // Two-space indent: the file is meant to be read and diffed by a human.
    serde_json::to_vec_pretty(&doc).unwrap_or_else(|_| b"{\"error\":\"serialization\"}".to_vec())
}

/// Where the copy goes, and whether it is encrypted: an explicit path wins
/// (`~/` expanded), otherwise `<hostsFolder>/backups/<stamp>`. A path the user
/// typed gets `.gpg` appended when encryption is on, so ciphertext never
/// lands in a file that looks plain.
fn target_for(
    settings: &AppSettings,
    target: Option<String>,
    encrypted: bool,
    stamp: &str,
) -> Result<PathBuf, AppError> {
    match target {
        Some(raw) if !raw.trim().is_empty() => {
            let mut path = paths::expand_tilde(raw.trim());
            if encrypted && path.extension().and_then(|e| e.to_str()) != Some("gpg") {
                let name = path
                    .file_name()
                    .map(|n| format!("{}.gpg", n.to_string_lossy()))
                    .unwrap_or_else(|| file_name(stamp, true));
                path = path.with_file_name(name);
            }
            Ok(path)
        }
        _ => Ok(backup_dir(settings)?.join(file_name(stamp, encrypted))),
    }
}

/// One backup copy of the library as it is on disk right now.
///
/// An encrypted library without the passphrase is refused (`locked`) rather
/// than exported as an empty file. The bytes are read back and compared before
/// the report is returned, so a short write is reported instead of trusted.
pub fn export(
    settings: &AppSettings,
    crypto: &LibraryCrypto,
    target: Option<String>,
    now_secs: u64,
) -> Result<ExportReport, AppError> {
    let dir = storage::data_dir(settings)?;
    let report = storage::report_from(&dir, settings.clone(), crypto)?;
    if report.locked {
        return Err(AppError::new(
            "locked",
            "The library is encrypted; enter the passphrase before backing it up.",
        ));
    }
    let encrypted = settings.encrypt_data && crypto.passphrase().is_some();
    let stamp = stamp(now_secs);
    let path = target_for(settings, target, encrypted, &stamp)?;
    if path.exists() {
        return Err(AppError::new(
            "exists",
            format!("{} already exists; pick another name.", path.display()),
        ));
    }

    let bytes = payload(&stamp, &report.hosts, &report.accounts, &report.bookmarks);
    let data = match (encrypted, crypto.passphrase()) {
        (true, Some(pass)) => crypto
            .runner
            .encrypt(&bytes, pass)
            .map_err(|e| AppError::new("gpg", e.message()))?,
        _ => bytes,
    };
    storage::atomic_write(&path, &data).map_err(|e| AppError::io(&path, e))?;
    let back = std::fs::read(&path).map_err(|e| AppError::io(&path, e))?;
    if back != data {
        return Err(AppError::new(
            "verify",
            format!("{} did not hold what FastSSH wrote", path.display()),
        ));
    }

    let out = ExportReport {
        path: path.display().to_string(),
        encrypted,
        hosts: report.hosts.len(),
        accounts: report.accounts.len(),
        bookmarks: report.bookmarks.len(),
    };
    log::info!(
        "library backed up to {} ({} hosts, {} accounts, {} bookmarks, encrypted: {})",
        out.path,
        out.hosts,
        out.accounts,
        out.bookmarks,
        out.encrypted
    );
    Ok(out)
}

#[cfg(test)]
mod tests;
