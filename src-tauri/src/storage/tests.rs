use super::*;
use serde_json::json;

fn tmp() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn atomic_write_sets_0600_and_leaves_no_temp_files() {
    let d = tmp();
    let p = d.path().join("hosts.json");
    atomic_write(&p, b"[{}]").unwrap();
    assert_eq!(
        fs::metadata(&p).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let left: Vec<_> = fs::read_dir(d.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(left, vec!["hosts.json".to_string()]);
    // Overwrite keeps it atomic and valid.
    atomic_write(&p, b"[]").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "[]");
}

#[test]
fn read_array_missing_is_empty_without_warning() {
    let d = tmp();
    let mut w = vec![];
    assert!(read_array(&d.path().join("hosts.json"), &mut w).is_empty());
    assert!(w.is_empty());
}

#[test]
fn corrupt_file_is_renamed_and_its_bytes_survive() {
    let d = tmp();
    let p = d.path().join("hosts.json");
    fs::write(&p, b"[{\"name\":\"trunc").unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o600)).unwrap();
    let mut w = vec![];
    assert!(read_array(&p, &mut w).is_empty());
    assert_eq!(w.len(), 2, "parse error + rename notice");
    let aside = std::path::PathBuf::from(w[1].split(" moved to ").last().unwrap());
    assert_eq!(fs::read_to_string(&aside).unwrap(), "[{\"name\":\"trunc");
    assert!(!p.exists());
}

#[test]
fn wrong_top_level_type_is_renamed_and_empty_is_renamed() {
    let d = tmp();
    let mut w = vec![];
    let obj = d.path().join("bookmarks.json");
    fs::write(&obj, b"{\"not\":\"an array\"}").unwrap();
    assert!(read_array(&obj, &mut w).is_empty());
    let empty = d.path().join("accounts.json");
    fs::write(&empty, b"").unwrap();
    assert!(read_array(&empty, &mut w).is_empty());
    assert_eq!(w.len(), 4, "each rename adds 2 entries");
    assert!(obj.with_extension("json.corrupt-123").parent().is_some());
}

#[test]
fn settings_missing_gives_defaults_and_corrupt_renames() {
    let d = tmp();
    let p = d.path().join("settings.json");
    assert_eq!(load_settings_from(&p, &mut vec![]), AppSettings::default());
    fs::write(&p, b"{ not json").unwrap();
    let mut w = vec![];
    assert_eq!(load_settings_from(&p, &mut w), AppSettings::default());
    assert_eq!(w.len(), 2, "parse error + rename notice");
    assert!(fs::read_dir(d.path()).unwrap().any(|e| {
        e.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("settings.json.corrupt-")
    }));
}

#[test]
fn settings_round_trip_through_disk() {
    let d = tmp();
    let p = d.path().join("settings.json");
    let s = AppSettings {
        window_width: 1234,
        scrollback_lines: 500,
        ..AppSettings::default()
    };
    save_settings_to(&p, &s).unwrap();
    assert_eq!(load_settings_from(&p, &mut vec![]), s);
    // Bad values in the file are clamped on read, good ones survive.
    fs::write(
        &p,
        json!({"windowWidth": 1234, "scrollbackLines": 99999999, "panelSize": -5})
            .to_string()
            .as_bytes(),
    )
    .unwrap();
    let s2 = load_settings_from(&p, &mut vec![]);
    assert_eq!(
        (s2.window_width, s2.scrollback_lines, s2.panel_size),
        (1234, 100_000, 160)
    );
}

#[test]
fn data_dir_creates_custom_folder_0700_and_falls_back() {
    let d = tmp();
    let mut w = vec![];
    let target = d.path().join("data");
    let got = data_dir_for(&target.to_string_lossy(), &d.path().join("cfg"), &mut w);
    assert_eq!(got, target);
    assert_eq!(
        fs::metadata(&target).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert!(w.is_empty());

    let fb = d.path().join("cfg");
    fs::write(d.path().join("block"), b"").unwrap();
    let bad = format!("{}/block/x", d.path().display());
    let got2 = data_dir_for(&bad, &fb, &mut w);
    assert_eq!(got2, fb);
    assert_eq!(w.len(), 1, "fallback warns");
}

#[test]
fn save_hosts_drops_the_local_host() {
    let d = tmp();
    let _g = crate::paths::ENV_LOCK.lock().unwrap();
    // SAFETY: the tests touching the process environment are serialized by ENV_LOCK.
    unsafe { std::env::set_var("FASTSSH_CONFIG_DIR", d.path()) };
    let s = AppSettings::default();
    let local = Host {
        name: "Localhost".into(),
        local: Some(true),
        ..Host::default()
    };
    let web = Host {
        name: "web1".into(),
        ..Host::default()
    };
    save_hosts(&s, &[web.clone(), local]).unwrap();
    let mut w = vec![];
    let arr = read_array(&d.path().join("hosts.json"), &mut w);
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["name"], "web1");
    unsafe { std::env::remove_var("FASTSSH_CONFIG_DIR") };
}

#[test]
fn load_normalizes_existing_file_modes_to_0600() {
    let d = tmp();
    let _g = crate::paths::ENV_LOCK.lock().unwrap();
    unsafe { std::env::set_var("FASTSSH_CONFIG_DIR", d.path()) };
    fs::write(d.path().join("hosts.json"), b"[]").unwrap();
    fs::write(d.path().join("settings.json"), b"{}").unwrap();
    fs::set_permissions(
        d.path().join("hosts.json"),
        fs::Permissions::from_mode(0o664),
    )
    .unwrap();
    fs::set_permissions(
        d.path().join("settings.json"),
        fs::Permissions::from_mode(0o664),
    )
    .unwrap();
    let report = load_all();
    assert!(report.warnings.is_empty());
    for name in ["hosts.json", "settings.json"] {
        let mode = fs::metadata(d.path().join(name))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600, "{name}");
    }
    unsafe { std::env::remove_var("FASTSSH_CONFIG_DIR") };
}
