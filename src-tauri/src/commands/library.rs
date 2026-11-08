//! Library commands: load_all + the four save_* (R4).
//! Handlers only parse args, call into storage, and map errors.

use crate::AppState;
use crate::error::AppError;
use crate::hosts_folder;
use crate::models::{Account, Bookmark, Host};
use crate::settings::AppSettings;
use crate::ssh_config_sync;
use crate::storage::{self, LoadReport};
use tauri::State;

/// Run blocking file I/O off the IPC thread.
pub(crate) async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::new("join", e.to_string()))?
}

#[tauri::command]
pub async fn load_all() -> Result<LoadReport, AppError> {
    blocking(|| Ok(storage::load_all())).await
}

/// Task 9.6: with Sync SSH config on, every host save also rebuilds
/// ~/.ssh/config. An export failure does not cancel the save; the warning comes
/// back as `Some(message)` so the UI can toast it.
#[tauri::command]
pub async fn save_hosts(
    state: State<'_, AppState>,
    hosts: Vec<Host>,
) -> Result<Option<String>, AppError> {
    let settings = state.settings.lock().map_err(lock_err)?.clone();
    blocking(move || ssh_config_sync::save_hosts_and_sync(&settings, &hosts)).await
}

#[tauri::command]
pub async fn save_accounts(
    state: State<'_, AppState>,
    accounts: Vec<Account>,
) -> Result<(), AppError> {
    let settings = state.settings.lock().map_err(lock_err)?.clone();
    blocking(move || storage::save_accounts(&settings, &accounts)).await
}

#[tauri::command]
pub async fn save_bookmarks(
    state: State<'_, AppState>,
    bookmarks: Vec<Bookmark>,
) -> Result<(), AppError> {
    let settings = state.settings.lock().map_err(lock_err)?.clone();
    blocking(move || storage::save_bookmarks(&settings, &bookmarks)).await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let to_write = settings.clone();
    blocking(move || storage::save_settings(&to_write)).await?;
    *state.settings.lock().map_err(lock_err)? = settings;
    Ok(())
}

fn lock_err(e: std::sync::PoisonError<std::sync::MutexGuard<'_, AppSettings>>) -> AppError {
    AppError::new("state", format!("settings mutex poisoned: {e}"))
}

/// Task 8.3: whether the folder the user typed already holds a library, so
/// the modal can ask "Load it?" instead of "Copy the current library there?".
/// Read-only: it never creates the folder.
#[tauri::command]
pub async fn folder_has_library(path: String) -> Result<bool, AppError> {
    blocking(move || Ok(hosts_folder::has_library(&path))).await
}

/// Task 8.3: load the library of that folder, or copy the current one into
/// it. The settings file is written by `save_settings` (the frontend owns the
/// single settings writer); only the in-memory copy is updated here so a
/// library save right after the change lands in the new folder.
#[tauri::command]
pub async fn set_hosts_folder(
    state: State<'_, AppState>,
    path: String,
    mode: String,
) -> Result<LoadReport, AppError> {
    let current = state.settings.lock().map_err(lock_err)?.clone();
    let report = blocking(move || hosts_folder::set_hosts_folder(&current, &path, &mode)).await?;
    *state.settings.lock().map_err(lock_err)? = report.settings.clone();
    Ok(report)
}
