//! Task 8.3 acceptance: "copy" writes the three files with mode 0600, and
//! "load" returns that folder's library. Every case runs in temp dirs; the
//! sandbox and the owner's files are never involved (rule 10).

use super::*;

fn crypto() -> crate::crypto::LibraryCrypto {
    crate::crypto::LibraryCrypto::unencrypted()
}

use crate::paths;
use std::fs;
use tempfile::TempDir;

/// config_dir() reads FASTSSH_CONFIG_DIR, so the env-touching tests are
/// serialized by the same lock paths.rs uses for its own.
struct Env {
    dir: TempDir,
    _lock: std::sync::MutexGuard<'static, ()>,
}

impl Env {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let _lock = paths::ENV_LOCK.lock().unwrap();
        // SAFETY: ENV_LOCK serializes every test that touches the environment.
        unsafe { std::env::set_var("FASTSSH_CONFIG_DIR", dir.path()) };
        Env { dir, _lock }
    }

    fn config(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        // SAFETY: paired with the set_var above, still under ENV_LOCK.
        unsafe { std::env::remove_var("FASTSSH_CONFIG_DIR") };
    }
}

fn one_host_json() -> String {
    r#"[{"name":"db1","group":"Lab","host":"10.0.0.5","port":22,"username":"root"}]"#.to_string()
}

fn mode_of(path: &Path) -> u32 {
    fs::metadata(path).unwrap().permissions().mode() & 0o777
}

fn settings_for(folder: &Path) -> AppSettings {
    AppSettings {
        hosts_folder: folder.display().to_string(),
        ..AppSettings::default()
    }
}

#[test]
fn copy_writes_the_three_files_with_mode_0600() {
    let env = Env::new();
    let from = env.config();
    let to = tempfile::tempdir().unwrap();
    fs::write(from.join("hosts.json"), one_host_json()).unwrap();
    fs::write(from.join("accounts.json"), "[]").unwrap();
    fs::write(from.join("bookmarks.json"), "[]").unwrap();

    // A folder the app has to create gets the private mode.
    let to_dir = to.path().join("library");
    let report = set_hosts_folder(
        &settings_for(&from),
        &to_dir.display().to_string(),
        "copy",
        &crypto(),
    )
    .unwrap();

    assert_eq!(report.hosts.len(), 1);
    assert_eq!(report.hosts[0].name, "db1");
    assert_eq!(report.settings.hosts_folder, to_dir.display().to_string());
    for name in LIBRARY_FILES {
        let file = to_dir.join(name);
        assert!(file.exists(), "{name} was not copied");
        assert_eq!(mode_of(&file), 0o600, "{name} must be 0600");
    }
    assert_eq!(mode_of(&to_dir), 0o700, "a folder we made is 0700");
}

#[test]
fn copy_creates_the_missing_files_as_empty_arrays() {
    let env = Env::new();
    let from = env.config();
    let to = tempfile::tempdir().unwrap();
    fs::write(from.join("hosts.json"), one_host_json()).unwrap();

    let report = set_hosts_folder(
        &settings_for(&from),
        &to.path().display().to_string(),
        "copy",
        &crypto(),
    )
    .unwrap();

    assert_eq!(report.accounts.len(), 0);
    assert_eq!(report.bookmarks.len(), 0);
    assert_eq!(
        fs::read_to_string(to.path().join("accounts.json")).unwrap(),
        "[]"
    );
}

#[test]
fn copy_keeps_the_gpg_name_and_the_0600_mode() {
    let env = Env::new();
    let from = env.config();
    let to = tempfile::tempdir().unwrap();
    fs::write(from.join("hosts.json.gpg"), b"encrypted-bytes").unwrap();

    set_hosts_folder(
        &settings_for(&from),
        &to.path().display().to_string(),
        "copy",
        &crypto(),
    )
    .unwrap();

    assert_eq!(
        fs::read(to.path().join("hosts.json.gpg")).unwrap(),
        b"encrypted-bytes"
    );
    assert_eq!(mode_of(&to.path().join("hosts.json.gpg")), 0o600);
    assert!(
        !to.path().join("hosts.json").exists(),
        "no plain file invented"
    );
}

#[test]
fn load_returns_that_folder_s_library() {
    let env = Env::new();
    let from = env.config();
    let to = tempfile::tempdir().unwrap();
    fs::write(from.join("hosts.json"), "[]").unwrap();
    fs::write(to.path().join("hosts.json"), one_host_json()).unwrap();
    fs::write(
        to.path().join("accounts.json"),
        r#"[{"name":"lab","username":"tester"}]"#,
    )
    .unwrap();

    let report = set_hosts_folder(
        &settings_for(&from),
        &to.path().display().to_string(),
        "load",
        &crypto(),
    )
    .unwrap();

    assert_eq!(report.hosts.len(), 1);
    assert_eq!(report.accounts.len(), 1);
    assert_eq!(
        report.settings.hosts_folder,
        to.path().display().to_string()
    );
    // The current library on disk is untouched by a load.
    assert_eq!(fs::read_to_string(from.join("hosts.json")).unwrap(), "[]");
}

#[test]
fn load_refuses_a_folder_without_a_library() {
    let env = Env::new();
    let from = env.config();
    let to = tempfile::tempdir().unwrap();

    let err = set_hosts_folder(
        &settings_for(&from),
        &to.path().display().to_string(),
        "load",
        &crypto(),
    )
    .unwrap_err();

    assert_eq!(err.code, "no_library");
    assert!(err.message.contains(&to.path().display().to_string()));
    assert!(err.message.contains("hosts.json"));
}

#[test]
fn has_library_sees_the_plain_and_the_encrypted_file() {
    let env = Env::new();
    let from = env.config();
    let with = tempfile::tempdir().unwrap();
    let gpg = tempfile::tempdir().unwrap();
    fs::write(with.path().join("hosts.json"), "[]").unwrap();
    fs::write(gpg.path().join("hosts.json.gpg"), b"x").unwrap();

    assert!(has_library(&with.path().display().to_string()));
    assert!(has_library(&gpg.path().display().to_string()));
    assert!(!has_library(
        &tempfile::tempdir().unwrap().path().display().to_string()
    ));
    // The default value means the config dir, not a literal "~/.config/fastssh".
    fs::write(from.join("hosts.json"), "[]").unwrap();
    assert!(has_library(&AppSettings::default().hosts_folder));
}

#[test]
fn an_unknown_mode_and_an_empty_path_are_rejected() {
    let env = Env::new();
    let from = env.config();
    let other = settings_for(&from);

    let err = set_hosts_folder(&other, "/tmp/fsx-target", "move", &crypto()).unwrap_err();
    assert_eq!(err.code, "bad_request");
    assert!(err.message.contains("move"));

    let err = set_hosts_folder(&other, "   ", "copy", &crypto()).unwrap_err();
    assert_eq!(err.code, "bad_request");
    assert!(err.message.contains("empty"));
}

#[test]
fn copying_onto_the_current_folder_changes_nothing() {
    let env = Env::new();
    let from = env.config();
    fs::write(from.join("hosts.json"), one_host_json()).unwrap();
    fs::write(from.join("accounts.json"), "[]").unwrap();
    fs::write(from.join("bookmarks.json"), "[]").unwrap();

    let report = set_hosts_folder(
        &settings_for(&from),
        &from.display().to_string(),
        "copy",
        &crypto(),
    )
    .unwrap();

    assert_eq!(report.hosts.len(), 1);
    assert_eq!(
        fs::read_to_string(from.join("hosts.json")).unwrap(),
        one_host_json()
    );
}

#[test]
fn a_folder_that_cannot_be_created_names_the_path_and_its_permissions() {
    let env = Env::new();
    let from = env.config();
    let parent = tempfile::tempdir().unwrap();
    fs::write(from.join("hosts.json"), one_host_json()).unwrap();
    fs::set_permissions(parent.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let to = parent.path().join("library");

    let err = set_hosts_folder(
        &settings_for(&from),
        &to.display().to_string(),
        "copy",
        &crypto(),
    )
    .unwrap_err();

    fs::set_permissions(parent.path(), fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(err.code, "io");
    assert!(err.message.contains(&to.display().to_string()));
    assert!(err.message.contains("permissions"));
}
