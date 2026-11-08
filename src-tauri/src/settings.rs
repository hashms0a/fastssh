//! AppSettings: defaults, lenient parse, clamping, migration hook.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenedHostState {
    pub host_name: String,
    pub tab_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub window_width: u32,
    pub window_height: u32,
    pub window_maximized: bool,
    pub panel_size: u32,
    pub hosts_folder: String,
    pub opened_hosts: Vec<OpenedHostState>,
    pub terminal_background_color: String,
    pub terminal_font: String,
    pub terminal_font_size: u32,
    pub use_dark_theme: bool,
    pub restore_hosts: bool,
    /// Stage 11 (P3): also reopen the Localhost tabs of the previous run.
    pub restore_localhost: bool,
    pub sync_ssh_config: bool,
    pub encrypt_data: bool,
    pub scrollback_lines: i32,
    pub audible_bell: bool,
    /// Added for Stage 2 (R22); the lenient parse covers it.
    pub collapsed_groups: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            window_width: 1100,
            window_height: 640,
            window_maximized: false,
            panel_size: 240,
            hosts_folder: "~/.config/fastssh".into(),
            opened_hosts: vec![],
            terminal_background_color: "#1e1e1e".into(),
            terminal_font: "Ubuntu Mono, Noto Sans Mono, monospace".into(),
            terminal_font_size: 13,
            use_dark_theme: true,
            restore_hosts: false,
            restore_localhost: false,
            sync_ssh_config: false,
            encrypt_data: false,
            scrollback_lines: -1,
            audible_bell: true,
            collapsed_groups: vec![],
        }
    }
}

fn u(o: &Map<String, Value>, k: &str, d: u32, lo: u32, hi: u32) -> u32 {
    o.get(k)
        .and_then(Value::as_i64)
        .map(|n| n.clamp(lo as i64, hi as i64) as u32)
        .unwrap_or(d)
}

fn b(o: &Map<String, Value>, k: &str, d: bool) -> bool {
    o.get(k).and_then(Value::as_bool).unwrap_or(d)
}

fn st(o: &Map<String, Value>, k: &str, d: &str) -> String {
    o.get(k)
        .and_then(Value::as_str)
        .filter(|x| !x.trim().is_empty())
        .unwrap_or(d)
        .to_string()
}

/// Lenient: one bad field never discards the others.
pub fn settings_from_value(v: Value) -> AppSettings {
    let d = AppSettings::default();
    let from = v.get("schemaVersion").and_then(Value::as_u64).unwrap_or(0) as u32;
    let v = migrate(v, from);
    let Some(o) = v.as_object() else {
        log::warn!("settings.json is not an object; using defaults");
        return d;
    };
    let sb = o
        .get("scrollbackLines")
        .and_then(Value::as_i64)
        .unwrap_or(-1);
    AppSettings {
        schema_version: SCHEMA_VERSION,
        window_width: u(o, "windowWidth", d.window_width, 800, 10000),
        window_height: u(o, "windowHeight", d.window_height, 500, 10000),
        window_maximized: b(o, "windowMaximized", d.window_maximized),
        panel_size: u(o, "panelSize", d.panel_size, 160, 600),
        hosts_folder: st(o, "hostsFolder", &d.hosts_folder),
        opened_hosts: o
            .get("openedHosts")
            .cloned()
            .and_then(|x| serde_json::from_value(x).ok())
            .unwrap_or_default(),
        terminal_background_color: st(o, "terminalBackgroundColor", &d.terminal_background_color),
        terminal_font: st(o, "terminalFont", &d.terminal_font),
        terminal_font_size: u(o, "terminalFontSize", d.terminal_font_size, 6, 48),
        use_dark_theme: b(o, "useDarkTheme", d.use_dark_theme),
        restore_hosts: b(o, "restoreHosts", d.restore_hosts),
        restore_localhost: b(o, "restoreLocalhost", d.restore_localhost),
        sync_ssh_config: b(o, "syncSshConfig", d.sync_ssh_config),
        encrypt_data: b(o, "encryptData", d.encrypt_data),
        scrollback_lines: if sb < 0 {
            -1
        } else {
            sb.clamp(100, 100_000) as i32
        },
        audible_bell: b(o, "audibleBell", d.audible_bell),
        collapsed_groups: o
            .get("collapsedGroups")
            .cloned()
            .and_then(|x| serde_json::from_value(x).ok())
            .unwrap_or_default(),
    }
}

/// Migration hook. Add one arm per version bump; each arm upgrades by one.
pub fn migrate(mut v: Value, from: u32) -> Value {
    let mut ver = from;
    while ver < SCHEMA_VERSION {
        if ver == 0 {
            // v0 = no schemaVersion (fresh or hand-written); nothing to rename.
        }
        // Add one arm per version bump (v1 -> v2 renames go here).
        ver += 1;
    }
    if let Some(o) = v.as_object_mut() {
        o.insert("schemaVersion".into(), SCHEMA_VERSION.into());
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_round_trip() {
        let d = AppSettings::default();
        let v = serde_json::to_value(&d).unwrap();
        assert_eq!(settings_from_value(v), d);
    }

    #[test]
    fn empty_object_gives_all_defaults() {
        assert_eq!(settings_from_value(json!({})), AppSettings::default());
    }

    #[test]
    fn missing_field_keeps_the_default_and_others_survive() {
        let s = settings_from_value(json!({"windowWidth": 1500, "audibleBell": false}));
        assert_eq!(s.window_width, 1500);
        assert!(!s.audible_bell);
        assert_eq!(s.window_height, 640);
        assert_eq!(s.terminal_font_size, 13);
    }

    #[test]
    fn wrong_type_falls_back_per_field() {
        let s = settings_from_value(json!({
            "windowWidth": "abc", "useDarkTheme": 3, "terminalFont": null,
            "openedHosts": "nope", "panelSize": -5
        }));
        let d = AppSettings::default();
        assert_eq!(s.window_width, d.window_width);
        assert!(s.use_dark_theme);
        assert_eq!(s.terminal_font, d.terminal_font);
        assert!(s.opened_hosts.is_empty());
        assert_eq!(s.panel_size, 160, "-5 clamps up to the minimum");
    }

    #[test]
    fn scrollback_is_clamped_and_minus_one_stays() {
        assert_eq!(
            settings_from_value(json!({"scrollbackLines": 99999999})).scrollback_lines,
            100_000
        );
        assert_eq!(
            settings_from_value(json!({"scrollbackLines": 500})).scrollback_lines,
            500
        );
        assert_eq!(
            settings_from_value(json!({"scrollbackLines": -1})).scrollback_lines,
            -1
        );
        assert_eq!(
            settings_from_value(json!({"scrollbackLines": -7})).scrollback_lines,
            -1
        );
    }

    #[test]
    fn window_size_clamps() {
        let s = settings_from_value(json!({"windowWidth": 10, "windowHeight": 99999}));
        assert_eq!((s.window_width, s.window_height), (800, 10000));
    }

    #[test]
    fn non_object_file_uses_defaults() {
        assert_eq!(settings_from_value(json!([1, 2])), AppSettings::default());
    }

    #[test]
    fn restore_localhost_defaults_off_and_survives_a_round_trip() {
        assert!(!settings_from_value(json!({})).restore_localhost);
        assert!(settings_from_value(json!({"restoreLocalhost": true})).restore_localhost);
        // A wrong type is the default, not a crash.
        assert!(!settings_from_value(json!({"restoreLocalhost": "yes"})).restore_localhost);
        // A file written before Stage 11 has no key and still parses.
        let s = settings_from_value(json!({"restoreHosts": true, "windowWidth": 900}));
        assert!(s.restore_hosts);
        assert!(!s.restore_localhost);
        assert_eq!(s.window_width, 900);
    }

    #[test]
    fn opened_hosts_and_collapsed_groups_parse() {
        let s = settings_from_value(json!({
            "openedHosts": [{"hostName": "db2", "tabCount": 2}],
            "collapsedGroups": ["Lab"]
        }));
        assert_eq!(s.opened_hosts[0].host_name, "db2");
        assert_eq!(s.opened_hosts[0].tab_count, 2);
        assert_eq!(s.collapsed_groups, vec!["Lab".to_string()]);
    }

    #[test]
    fn migrate_stamps_the_current_schema_version() {
        let v = migrate(json!({"schemaVersion": 0}), 0);
        assert_eq!(v["schemaVersion"], SCHEMA_VERSION);
        // A settings file written without schemaVersion still parses.
        let s = settings_from_value(json!({"panelSize": 300}));
        assert_eq!(s.panel_size, 300);
        assert_eq!(s.schema_version, SCHEMA_VERSION);
    }
}
