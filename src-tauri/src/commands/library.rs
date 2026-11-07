//! Library commands: load_all + the four save_* (R4).
//! Handlers only parse args, call into storage, and map errors.

use crate::AppState;
use crate::error::AppError;
use crate::models::{Account, Bookmark, Host};
use crate::settings::AppSettings;
use crate::storage::{self, LoadReport};
use tauri::State;

/// Run blocking file I/O off the IPC thread.
async fn blocking<T: Send + 'static>(
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

#[tauri::command]
pub async fn save_hosts(state: State<'_, AppState>, hosts: Vec<Host>) -> Result<(), AppError> {
    let settings = state.settings.lock().map_err(lock_err)?.clone();
    blocking(move || storage::save_hosts(&settings, &hosts)).await
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
