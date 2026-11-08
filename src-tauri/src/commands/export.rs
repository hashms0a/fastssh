//! Stage 11 (P2) command: back the library up into one JSON file. The handler
//! only reads the state, stamps the time, and calls into `export`.

use crate::AppState;
use crate::commands::crypto_ctx;
use crate::commands::library::blocking;
use crate::error::AppError;
use crate::export::{self, ExportReport};
use tauri::State;

/// Unix seconds for the backup name, 0 when the clock is broken.
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// `path` = None puts the copy in `<hostsFolder>/backups/`; a typed path is
/// used as-is (`~/` expanded), with `.gpg` added when encryption is on.
#[tauri::command]
pub async fn export_library(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<ExportReport, AppError> {
    let settings = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let crypto = crypto_ctx(&state);
    let now = now_secs();
    blocking(move || export::export(&settings, &crypto, path, now)).await
}
