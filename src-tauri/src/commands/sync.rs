//! ~/.ssh/config sync commands (task 9.6, R7). Handlers only parse arguments,
//! call into `ssh_config_sync`, and map errors.
//!
//! Enabling runs backup -> import -> save library -> export, then the flag is
//! set in the in-memory settings so the next `save_hosts` exports too. The
//! settings FILE is written by the frontend's single settings writer
//! (`updateSettings` + the debounced save), as in Stage 8.

use crate::AppState;
use crate::commands::crypto_ctx;
use crate::commands::library::blocking;
use crate::error::AppError;
use crate::models::Host;
use crate::paths;
use crate::ssh_config_sync::{self, SyncInfo, SyncReport};
use tauri::State;

/// What enabling sync would do, for the confirm dialog (task 9.7). The config
/// is only read here; nothing is written.
#[tauri::command]
pub async fn ssh_config_info() -> Result<SyncInfo, AppError> {
    blocking(move || Ok(ssh_config_sync::info(&paths::ssh_dir()))).await
}

#[tauri::command]
pub async fn enable_ssh_config_sync(
    state: State<'_, AppState>,
    hosts: Vec<Host>,
) -> Result<SyncReport, AppError> {
    let settings = state.settings.lock().map_err(lock_err)?.clone();
    let crypto = crypto_ctx(&state);
    let report = blocking(move || ssh_config_sync::enable(&settings, &hosts, &crypto)).await?;
    // Only after a successful export: a failed enable leaves sync off.
    let mut guard = state.settings.lock().map_err(lock_err)?;
    guard.sync_ssh_config = true;
    Ok(report)
}

/// Task 9.6: turning sync off only clears the flag; the config file keeps the
/// managed section, which the user can edit by hand from now on.
#[tauri::command]
pub async fn disable_ssh_config_sync(state: State<'_, AppState>) -> Result<(), AppError> {
    state.settings.lock().map_err(lock_err)?.sync_ssh_config = false;
    Ok(())
}

fn lock_err(
    e: std::sync::PoisonError<std::sync::MutexGuard<'_, crate::settings::AppSettings>>,
) -> AppError {
    AppError::new("state", format!("settings mutex poisoned: {e}"))
}
