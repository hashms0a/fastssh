use crate::error::AppError;
use crate::file_browser;
use serde::Serialize;

#[derive(Serialize)]
pub struct RuntimeInfo {
    pub version: String,
    pub desktop: String,
    pub session: String,
    pub appimage: bool,
    pub dmabuf_disabled: bool,
}

/// XDG_CURRENT_DESKTOP is a colon list, e.g. "ubuntu:GNOME". Pick the
/// segment that names the desktop environment (owner preference:
/// "GNOME/wayland", not "ubuntu/wayland"); fall back to the first segment.
pub fn desktop_label(value: Option<&str>) -> String {
    const KNOWN: [&str; 10] = [
        "GNOME", "KDE", "XFCE", "LXQt", "LXDE", "Cinnamon", "MATE", "Unity", "Pantheon", "Deepin",
    ];
    let raw = value.unwrap_or("unknown");
    let first = raw
        .split(':')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown");
    for seg in raw.split(':') {
        for k in KNOWN {
            if seg.eq_ignore_ascii_case(k) {
                return k.to_string();
            }
        }
    }
    first.to_string()
}

/// Report the environment the app is running in (shown in the workspace,
/// used by e2e and the About dialog).
#[tauri::command]
pub fn get_runtime_info() -> RuntimeInfo {
    let env = crate::env_sanitize::clean_env();
    let desktop = desktop_label(env.get("XDG_CURRENT_DESKTOP").map(|s| s.as_str()));
    let session = env
        .get("XDG_SESSION_TYPE")
        .cloned()
        .unwrap_or_else(|| "unknown".into());
    RuntimeInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        desktop,
        session,
        // The clean env has the AppImage variables stripped (children must not
        // see them), so this reads the process environment instead: the status
        // line is supposed to say whether the app itself runs from an AppImage.
        appimage: std::env::var("APPIMAGE").is_ok() || std::env::var("APPDIR").is_ok(),
        dmabuf_disabled: std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER")
            .map(|v| v == "1")
            .unwrap_or(true),
    }
}

/// Quit the app (header menu / Ctrl+Q). Stage 8 adds the flush-first flow.
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// A launcher can hold the URL for up to 10 s, so both openers run on the
/// blocking pool instead of the IPC thread.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::new("join", e.to_string()))?
}

/// R16 / Ctrl+Shift+E / "Show in File Browser" (task 7.4).
/// The frontend resolves the real target first — account credentials and,
/// in sync mode, the HostName/Port/User of the ssh_config block — so this
/// command only builds the URL and runs the launcher chain. It returns the
/// launcher that accepted the URL; on failure the AppError message contains
/// the URL, which the UI shows with a Copy button (task 7.5).
#[tauri::command]
pub async fn open_sftp_file_browser(
    username: String,
    host: String,
    port: u16,
) -> Result<String, AppError> {
    let url = file_browser::sftp_url(&username, &host, port);
    let desktop = crate::env_sanitize::clean_env()
        .get("XDG_CURRENT_DESKTOP")
        .cloned()
        .unwrap_or_default();
    blocking(move || {
        file_browser::open_sftp(&url, &desktop)
            .map(str::to_string)
            .map_err(|m| AppError::new("open", m))
    })
    .await
}

/// R12: a link clicked in the terminal. http/https only (task 7.3).
#[tauri::command]
pub async fn open_url(url: String) -> Result<String, AppError> {
    if !file_browser::is_web_url(&url) {
        return Err(AppError::new(
            "scheme",
            format!("FastSSH opens only http:// and https:// links ({url})."),
        ));
    }
    blocking(move || {
        file_browser::open_web_url(&url)
            .map(str::to_string)
            .map_err(|m| AppError::new("open", m))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{desktop_label, get_runtime_info};

    /// The About dialog and the workspace status bar print exactly this value,
    /// so it has to be the version the manifest declares. An AppImage packed
    /// before a version bump used to show a number the repo no longer had;
    /// `src/version.test.ts` keeps the other manifests in step with this one.
    #[test]
    fn reports_the_version_cargo_toml_declares() {
        let declared = include_str!("../../Cargo.toml")
            .lines()
            .find_map(|line| line.trim().strip_prefix("version = \""))
            .and_then(|rest| rest.split('"').next())
            .expect("Cargo.toml declares [package] version");
        assert_eq!(get_runtime_info().version, env!("CARGO_PKG_VERSION"));
        assert_eq!(get_runtime_info().version, declared);
    }

    #[test]
    fn prefers_the_known_desktop_segment() {
        assert_eq!(desktop_label(Some("ubuntu:GNOME")), "GNOME");
        assert_eq!(desktop_label(Some("KDE")), "KDE");
        assert_eq!(desktop_label(Some("x-cinnamon:MATE")), "MATE");
    }

    #[test]
    fn falls_back_to_the_first_segment_or_unknown() {
        assert_eq!(desktop_label(Some("sway:sway")), "sway");
        assert_eq!(desktop_label(None), "unknown");
        assert_eq!(desktop_label(Some("")), "unknown");
    }
}
