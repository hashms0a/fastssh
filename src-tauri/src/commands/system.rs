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
        appimage: env.contains_key("APPIMAGE"),
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

#[cfg(test)]
mod tests {
    use super::desktop_label;

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
