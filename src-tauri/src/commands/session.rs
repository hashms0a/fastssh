//! Session commands: spawn / write / resize / kill (R9, task 4.3).
//! Handlers only parse arguments, call the PtyManager and map errors.

use crate::error::AppError;
use crate::models::Host;
use crate::pty_manager::{PtyManager, SpawnSpec};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Stage 4 only runs the local shell; remote hosts arrive in Stage 5.
fn spec_for(host: &Host, sync_ssh_config: bool) -> Result<SpawnSpec, AppError> {
    if host.local == Some(true) {
        return Ok(SpawnSpec::LocalShell);
    }
    log::debug!(
        "spawn_session for {} (sync={sync_ssh_config}) is not built yet",
        host.name
    );
    Err(AppError::new(
        "unsupported",
        format!("SSH connections for {} are added in Stage 5", host.name),
    ))
}

#[tauri::command]
pub fn spawn_session(
    app: AppHandle,
    manager: State<'_, PtyManager>,
    session_id: String,
    host: Host,
    sync_ssh_config: bool,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    if session_id.is_empty() {
        return Err(AppError::new("bad_request", "session_id is required"));
    }
    let spec = spec_for(&host, sync_ssh_config)?;
    manager
        .spawn(Arc::new(app), session_id, spec, cols, rows)
        .map_err(|e| AppError::new("pty", e))
}

#[tauri::command]
pub fn write_pty(
    manager: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    manager
        .write(&session_id, &data)
        .map_err(|e| AppError::new("pty", e))
}

#[tauri::command]
pub fn resize_pty(
    manager: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    manager
        .resize(&session_id, cols, rows)
        .map_err(|e| AppError::new("pty", e))
}

#[tauri::command]
pub fn kill_session(manager: State<'_, PtyManager>, session_id: String) -> Result<(), AppError> {
    manager.kill(&session_id);
    Ok(())
}
