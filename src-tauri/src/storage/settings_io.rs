//! settings.json: always in the config dir, always plain (never encrypted),
//! read tolerantly, written atomically.

use super::{atomic_write, rename_aside};
use crate::error::AppError;
use crate::paths;
use crate::settings::{self, AppSettings};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub fn settings_path() -> PathBuf {
    paths::config_dir().join("settings.json")
}

/// Sync, tolerant read of settings.json (used by lib.rs before the window
/// is built and by load_all).
pub fn load_settings() -> AppSettings {
    load_settings_with_warnings(&mut vec![])
}

/// What the read before the window found. `lib.rs` needs the window size at
/// that point, and that read renames a corrupt file aside; without this the
/// user's settings would reset with nothing on screen to say why. The first
/// `load_all` hands them to the frontend.
static BOOT_WARNINGS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

pub fn load_settings_for_boot() -> AppSettings {
    let mut warnings = vec![];
    let settings = load_settings_with_warnings(&mut warnings);
    if !warnings.is_empty() {
        BOOT_WARNINGS.lock().unwrap().extend(warnings);
    }
    settings
}

/// Once: the boot warnings go out with the first `load_all` report.
pub fn take_boot_warnings() -> Vec<String> {
    std::mem::take(&mut *BOOT_WARNINGS.lock().unwrap())
}

pub fn load_settings_with_warnings(warnings: &mut Vec<String>) -> AppSettings {
    load_settings_from(&settings_path(), warnings)
}

pub fn load_settings_from(path: &std::path::Path, warnings: &mut Vec<String>) -> AppSettings {
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
