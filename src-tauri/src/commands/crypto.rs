//! Task 10.3 commands (R6) + task 10.7's import command (R5). Handlers only
//! parse arguments, call into `crypto`/`legacy_import`, and map errors. The
//! passphrase is accepted here and kept in `AppState` - never in the frontend
//! store, never in a log line.

use crate::commands::crypto_ctx;
use crate::commands::library::blocking;
use crate::crypto;
use crate::error::AppError;
use crate::legacy_import::{self, ImportReport};
use crate::settings::AppSettings;
use crate::storage::LoadReport;
use serde::Serialize;
use tauri::State;

/// Whether the host `gpg` exists, so Preferences can disable the Encrypt
/// toggle with the plan's tooltip instead of failing on the first save.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CryptoInfo {
    pub available: bool,
}

#[tauri::command]
pub async fn crypto_info(state: State<'_, crate::AppState>) -> Result<CryptoInfo, AppError> {
    let runner = std::sync::Arc::clone(&state.runner);
    blocking(move || {
        Ok(CryptoInfo {
            available: runner.is_available(),
        })
    })
    .await
}

/// Try a passphrase against the library on disk. A wrong one comes back as
/// `wrong_passphrase` and nothing is stored.
#[tauri::command]
pub async fn unlock_library(
    state: State<'_, crate::AppState>,
    passphrase: String,
) -> Result<LoadReport, AppError> {
    let crypto = crypto::ctx(&state.runner, Some(passphrase.clone()));
    let report = blocking(move || crypto::unlock(&crypto)).await?;
    *state.passphrase.lock().unwrap_or_else(|e| e.into_inner()) = Some(passphrase);
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = report.settings.clone();
    Ok(report)
}

/// Enable or disable encryption of the three library files. The in-memory flag
/// and the passphrase change only after the files are right; the frontend owns
/// the settings file write (single writer, Stage 8).
#[tauri::command]
pub async fn set_encryption(
    state: State<'_, crate::AppState>,
    enabled: bool,
    passphrase: Option<String>,
) -> Result<(), AppError> {
    let pass = passphrase.unwrap_or_default();
    if pass.is_empty() {
        return Err(AppError::new(
            "bad_passphrase",
            if enabled {
                "Type a passphrase of at least 8 characters."
            } else {
                "Type the current passphrase; FastSSH needs it to decrypt the library."
            },
        ));
    }
    let settings = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let base = settings.clone();
    let crypto = crypto::ctx(&state.runner, Some(pass.clone()));
    blocking(move || match enabled {
        true => crypto::enable(&settings, &crypto),
        false => crypto::disable(&settings, &crypto),
    })
    .await?;

    let next = AppSettings {
        encrypt_data: enabled,
        ..base
    };
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = next;
    *state.passphrase.lock().unwrap_or_else(|e| e.into_inner()) =
        if enabled { Some(pass) } else { None };
    Ok(())
}

/// Unlock is impossible (an unreadable `*.json.gpg`): set the encrypted files
/// aside with their bytes and start from what is left. The bytes stay on disk.
#[tauri::command]
pub async fn start_empty_library(
    state: State<'_, crate::AppState>,
) -> Result<LoadReport, AppError> {
    let crypto = crypto_ctx(&state);
    let report = blocking(move || crypto::start_empty(&crypto)).await?;
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = report.settings.clone();
    Ok(report)
}

/// Task 10.7: one-click import from the legacy EasySSH folder (R5).
#[tauri::command]
pub async fn import_easyssh(state: State<'_, crate::AppState>) -> Result<ImportReport, AppError> {
    let settings = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let crypto = crypto_ctx(&state);
    blocking(move || legacy_import::import(&settings, &crypto)).await
}

/// Stage 11 (Stage 10 open question 1): drop the passphrase from memory.
/// Files on disk are untouched, open tabs keep their sessions; the next read or
/// save needs the passphrase again, which is what makes the UI show the unlock
/// modal. Nothing is written here, so no `AppError` is possible.
#[tauri::command]
pub async fn lock_library(state: State<'_, crate::AppState>) -> Result<(), AppError> {
    *state.passphrase.lock().unwrap_or_else(|e| e.into_inner()) = None;
    log::info!("library locked; the passphrase is no longer held");
    Ok(())
}
