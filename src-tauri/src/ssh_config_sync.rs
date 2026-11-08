//! The file work behind Sync SSH config (tasks 9.4-9.6): backup, atomic write,
//! enable/disable, and the export that runs on every host save.
//!
//! Everything here resolves through `paths::ssh_dir()`, which honours
//! FASTSSH_SSH_DIR: a test run can never touch the owner's ~/.ssh/config
//! (rule 10, plan Stage 9 note).

use crate::error::AppError;
use crate::models::Host;
use crate::paths;
use crate::settings::AppSettings;
use crate::ssh_config::{self, ImportResult};
use crate::storage;
use serde::Serialize;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

pub fn config_path(ssh_dir: &Path) -> PathBuf {
    ssh_dir.join("config")
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The current text, or "" when there is no config yet. Read failures are
/// reported by the caller that needs the bytes; export treats "" as "no
/// existing blocks", which is the safest interpretation.
pub fn read_config(ssh_dir: &Path) -> String {
    fs::read_to_string(config_path(ssh_dir)).unwrap_or_default()
}

/// Task 9.4: `config.backup`, or `config.backup.<unix-ts>` when that name is
/// taken, so the pristine original is never overwritten.
pub fn backup_target(ssh_dir: &Path) -> PathBuf {
    let first = ssh_dir.join("config.backup");
    if !first.exists() {
        return first;
    }
    // Two enables in the same second must not overwrite the first backup.
    let mut ts = unix_now();
    loop {
        let candidate = ssh_dir.join(format!("config.backup.{ts}"));
        if !candidate.exists() {
            return candidate;
        }
        ts += 1;
    }
}

/// Copy the config aside before anything is modified. `None` when there is no
/// config to back up. `fs::copy` keeps the mode; it is set explicitly anyway.
pub fn backup(ssh_dir: &Path) -> Result<Option<PathBuf>, AppError> {
    let from = config_path(ssh_dir);
    if !from.exists() {
        return Ok(None);
    }
    let to = backup_target(ssh_dir);
    let mode = fs::metadata(&from)
        .map(|m| m.permissions().mode() & 0o777)
        .unwrap_or(0o600);
    fs::copy(&from, &to).map_err(|e| AppError::io(&to, e))?;
    let _ = fs::set_permissions(&to, fs::Permissions::from_mode(mode));
    Ok(Some(to))
}

/// Task 9.5: create a missing ssh dir as 0700. An existing dir keeps its own
/// mode - chmodding it would silently undo a deliberate read-only setup.
fn ensure_ssh_dir(ssh_dir: &Path) -> Result<(), AppError> {
    if ssh_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(ssh_dir).map_err(|e| AppError::io(ssh_dir, e))?;
    let _ = fs::set_permissions(ssh_dir, fs::Permissions::from_mode(0o700));
    Ok(())
}

/// Task 9.5: write through a symlink (dotfile managers link ~/.ssh/config) and
/// keep the 0600 mode ssh requires, atomically via `storage::atomic_write`.
pub fn write_config(ssh_dir: &Path, text: &str) -> Result<(), AppError> {
    ensure_ssh_dir(ssh_dir)?;
    let link = config_path(ssh_dir);
    let target = fs::canonicalize(&link).unwrap_or(link);
    storage::atomic_write(&target, text.as_bytes()).map_err(|e| AppError::io(&target, e))
}

/// Rebuild the config from the library, keeping the file's own global and
/// wildcard blocks.
pub fn write_from_library(ssh_dir: &Path, hosts: &[Host]) -> Result<(), AppError> {
    write_config(ssh_dir, &ssh_config::export(&read_config(ssh_dir), hosts))
}

/// What enabling sync will do, for the confirm dialog (task 9.7).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    pub config_path: String,
    pub backup_path: String,
    pub has_config: bool,
}

pub fn info(ssh_dir: &Path) -> SyncInfo {
    SyncInfo {
        config_path: config_path(ssh_dir).display().to_string(),
        backup_path: backup_target(ssh_dir).display().to_string(),
        has_config: config_path(ssh_dir).exists(),
    }
}

/// The result of enabling sync; `hosts` is the library including the imports so
/// the frontend can show them without a second read.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub backup_path: Option<String>,
    pub imported: Vec<Host>,
    pub skipped: Vec<String>,
    pub hosts: Vec<Host>,
}

/// Task 9.6: backup, import, save the library, export, and (in the caller) set
/// the flag. Nothing is written before the backup exists.
pub fn enable(settings: &AppSettings, hosts: &[Host]) -> Result<SyncReport, AppError> {
    let ssh_dir = paths::ssh_dir();
    let backup_path = backup(&ssh_dir)?;
    let existing = read_config(&ssh_dir);
    let names: std::collections::HashSet<String> = hosts
        .iter()
        .filter(|h| h.local != Some(true))
        .map(|h| h.name.clone())
        .collect();
    let ImportResult {
        hosts: added,
        skipped,
    } = ssh_config::import(&ssh_config::parse(&existing), &names);
    let mut merged: Vec<Host> = hosts
        .iter()
        .filter(|h| h.local != Some(true))
        .cloned()
        .collect();
    merged.extend(added.clone());

    let syncing = AppSettings {
        sync_ssh_config: true,
        ..settings.clone()
    };
    storage::save_hosts(&syncing, &merged)?;
    // If the export fails the library is already saved; the error is shown and
    // the frontend leaves the flag off, so the next save does not half-sync.
    write_from_library(&ssh_dir, &merged)?;

    Ok(SyncReport {
        backup_path: backup_path.map(|p| p.display().to_string()),
        imported: added,
        skipped,
        hosts: merged,
    })
}

/// Task 9.6: save the library and, when sync is on, export it. An export
/// failure never cancels the save - it comes back as a warning the UI toasts.
pub fn save_hosts_and_sync(
    settings: &AppSettings,
    hosts: &[Host],
) -> Result<Option<String>, AppError> {
    storage::save_hosts(settings, hosts)?;
    if !settings.sync_ssh_config {
        return Ok(None);
    }
    match write_from_library(&paths::ssh_dir(), hosts) {
        Ok(()) => Ok(None),
        Err(e) => {
            log::warn!("ssh_config export failed: {}", e.message);
            Ok(Some(e.message))
        }
    }
}

#[cfg(test)]
mod enable_tests;
#[cfg(test)]
pub(crate) mod test_env;
#[cfg(test)]
mod tests;
