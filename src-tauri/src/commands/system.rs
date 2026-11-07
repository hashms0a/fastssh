use serde::Serialize;

#[derive(Serialize)]
pub struct RuntimeInfo {
    pub version: String,
    pub desktop: String,
    pub session: String,
    pub appimage: bool,
    pub dmabuf_disabled: bool,
}

/// Report the environment the app is running in (shown in the workspace,
/// used by e2e and the About dialog).
#[tauri::command]
pub fn get_runtime_info() -> RuntimeInfo {
    let env = crate::env_sanitize::clean_env();
    let desktop = env
        .get("XDG_CURRENT_DESKTOP")
        .map(|d| d.split(':').next().unwrap_or("unknown").to_string())
        .unwrap_or_else(|| "unknown".into());
    let session = env
        .get("XDG_SESSION_TYPE")
        .cloned()
        .unwrap_or_else(|| "unknown".into());
    RuntimeInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        desktop,
        session,
        appimage: env.contains_key("APPIMAGE"),
        dmabuf_disabled: std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER")
            .map(|v| v == "1")
            .unwrap_or(true),
    }
}
