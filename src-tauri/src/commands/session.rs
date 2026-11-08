//! Session commands: spawn / write / resize / kill (R9, tasks 4.3 and 5.3).
//! Handlers only parse arguments, call the PtyManager and map errors.

use crate::error::AppError;
use crate::models::Host;
use crate::paths;
use crate::pty_manager::{PtyManager, SpawnSpec};
use crate::ssh_command::{Creds, build_ssh_line};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// The frontend resolves account credentials before calling us (task 5.2),
/// so this handler trusts the copy and only re-checks the port and the host,
/// which `build_ssh_line` does.
fn spec_for(host: &Host, sync_ssh_config: bool) -> Result<SpawnSpec, AppError> {
    if host.local == Some(true) {
        return Ok(SpawnSpec::LocalShell);
    }
    if host.name.trim().is_empty() {
        return Err(AppError::new("bad_request", "The connection has no name."));
    }
    let creds = Creds {
        username: &host.username,
        identity_file: &host.identity_file,
    };
    // FASTSSH_SSH_DIR (the sandbox) makes ssh use the test config and
    // known_hosts, so a test never touches the owner's ~/.ssh (R20).
    let sandbox = paths::ssh_dir_overridden().then(paths::ssh_dir);
    let line = build_ssh_line(host, &creds, sync_ssh_config, sandbox.as_deref())
        .map_err(|msg| AppError::new("bad_request", msg))?;
    // The line holds no password; log the name only, never `host`.
    log::debug!(
        "spawn_session {} sync={} sandbox={}",
        host.name,
        sync_ssh_config,
        sandbox.is_some()
    );
    Ok(SpawnSpec::Ssh(line))
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
