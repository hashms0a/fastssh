//! Task 10.8: the EasySSH import against the sandbox fixture.
//!
//! `src-tauri/tests/fixtures/legacy_*.json` are byte copies of
//! `~/fastssh-testenv/legacy/`, so the test runs in temp dirs and the real
//! `~/.config/easyssh` is never involved (rule 10).

use super::*;
use crate::paths;
use crate::settings::AppSettings;
use crate::storage;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

struct Env {
    config: TempDir,
    legacy: TempDir,
    _lock: std::sync::MutexGuard<'static, ()>,
}

impl Env {
    fn new() -> Self {
        let config = tempfile::tempdir().unwrap();
        let legacy = tempfile::tempdir().unwrap();
        let src = fixtures();
        for (from, to) in [
            ("legacy_hosts.json", "hosts.json"),
            ("legacy_accounts.json", "accounts.json"),
            ("legacy_bookmarks.json", "bookmarks.json"),
        ] {
            fs::copy(src.join(from), legacy.path().join(to)).expect("copy fixture");
        }
        let _lock = paths::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: ENV_LOCK serializes every test that touches the environment.
        unsafe {
            std::env::set_var("FASTSSH_CONFIG_DIR", config.path());
            std::env::set_var("FASTSSH_LEGACY_DIR", legacy.path());
        }
        Env {
            config,
            legacy,
            _lock,
        }
    }

    fn dir(&self) -> &Path {
        self.config.path()
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        // SAFETY: paired with the set_var above, still under ENV_LOCK.
        unsafe {
            std::env::remove_var("FASTSSH_CONFIG_DIR");
            std::env::remove_var("FASTSSH_LEGACY_DIR");
        }
    }
}

fn plain(path: &Path) -> Vec<Value> {
    storage::read_array(path, &mut vec![])
}

fn names(items: &[Value]) -> Vec<String> {
    items
        .iter()
        .filter_map(|v| v.get("name").and_then(Value::as_str).map(str::to_string))
        .collect()
}

fn crypto() -> LibraryCrypto {
    LibraryCrypto::new(std::sync::Arc::new(crate::gpg::GpgRunner::system()))
}

#[test]
fn the_sandbox_fixture_imports_5_hosts_1_account_and_2_bookmarks() {
    let env = Env::new();
    let settings = AppSettings::default();
    let report = import(&settings, &crypto()).expect("import");

    assert_eq!(report.hosts_added, 5);
    assert_eq!(report.accounts_added, 1);
    assert_eq!(report.bookmarks_added, 2);
    assert!(report.skipped.is_empty());

    let hosts = plain(&env.dir().join("hosts.json"));
    assert_eq!(hosts.len(), 5);
    assert_eq!(
        names(&hosts),
        vec!["item10", "item2", "my-server", "Сервер-1", "bad-port",],
        "spaces become '-', and every record keeps its order"
    );
    // The legacy port is a STRING; the account link and the tunnel survive.
    assert_eq!(hosts[0]["port"], "2222");
    assert_eq!(hosts[0]["tunnels"], "-L 18080:localhost:80");
    assert_eq!(hosts[1]["account"], "lab-key");
    // An id is generated for every record (EasySSH has none).
    for h in &hosts {
        assert!(
            !h["id"].as_str().unwrap_or("").is_empty(),
            "missing id: {h}"
        );
    }

    // bad-port has port "abc": it is imported with 22 and one warning.
    let bad = hosts
        .iter()
        .find(|h| h["name"] == "bad-port")
        .expect("bad-port");
    assert_eq!(bad["port"], "22");
    assert!(
        report
            .warnings
            .iter()
            .any(|w| w.contains("bad-port") && w.contains("using 22")),
        "warnings: {:?}",
        report.warnings
    );

    let accounts = plain(&env.dir().join("accounts.json"));
    assert_eq!(names(&accounts), vec!["lab-key"]);
    assert_eq!(
        accounts[0]["identity-file"],
        "~/fastssh-testenv/ssh/id_test"
    );
    assert_eq!(
        names(&plain(&env.dir().join("bookmarks.json"))),
        vec!["uptime", "disk"]
    );
}

#[test]
fn a_second_import_adds_nothing_and_skips_every_name() {
    let env = Env::new();
    let settings = AppSettings::default();
    let first = import(&settings, &crypto()).unwrap();
    let second = import(&settings, &crypto()).unwrap();

    assert_eq!(first.hosts_added, 5);
    assert_eq!(second.hosts_added, 0);
    assert_eq!(second.accounts_added, 0);
    assert_eq!(second.bookmarks_added, 0);
    // `skipped` counts every record whose name already exists: the 5 hosts,
    // the 1 account and the 2 bookmarks.
    assert_eq!(
        second.skipped,
        vec![
            "item10",
            "item2",
            "my-server",
            "Сервер-1",
            "bad-port",
            "lab-key",
            "uptime",
            "disk",
        ]
    );
    assert_eq!(plain(&env.dir().join("hosts.json")).len(), 5);
    // The ids did not change, so open tabs and account links stay valid.
    let ids: Vec<String> = plain(&env.dir().join("hosts.json"))
        .iter()
        .map(|h| h["id"].as_str().unwrap_or("").to_string())
        .collect();
    assert_eq!(ids.len(), 5);
    assert_eq!(
        ids.iter().collect::<HashSet<_>>().len(),
        5,
        "ids stay unique"
    );
}

#[test]
fn an_existing_name_is_skipped_and_a_new_name_still_arrives() {
    let env = Env::new();
    let settings = AppSettings::default();
    storage::atomic_write(
        &env.dir().join("hosts.json"),
        br#"[{"id":"old-1","name":"item10","group":"Mine","host":"1.2.3.4","port":"22","username":"","password":"","identity-file":"","account":"","color":"","font":"","tunnels":"","extra-arguments":"","ssh_config":""}]"#,
    )
    .unwrap();

    let report = import(&settings, &crypto()).unwrap();
    assert_eq!(report.hosts_added, 4);
    assert_eq!(report.skipped, vec!["item10".to_string()]);

    let hosts = plain(&env.dir().join("hosts.json"));
    assert_eq!(hosts.len(), 5);
    let kept = hosts.iter().find(|h| h["name"] == "item10").unwrap();
    assert_eq!(kept["id"], "old-1", "the existing record is not replaced");
    assert_eq!(kept["host"], "1.2.3.4");
}

#[test]
fn the_legacy_folder_is_byte_for_byte_unchanged() {
    let env = Env::new();
    let before: Vec<(String, Vec<u8>)> = fs::read_dir(env.legacy.path())
        .unwrap()
        .map(|e| {
            let p = e.unwrap().path();
            (p.to_string_lossy().to_string(), fs::read(&p).unwrap())
        })
        .collect();

    let settings = AppSettings::default();
    import(&settings, &crypto()).unwrap();
    import(&settings, &crypto()).unwrap();

    let after: Vec<(String, Vec<u8>)> = fs::read_dir(env.legacy.path())
        .unwrap()
        .map(|e| {
            let p = e.unwrap().path();
            (p.to_string_lossy().to_string(), fs::read(&p).unwrap())
        })
        .collect();
    assert_eq!(
        before, after,
        "the import must never write to the legacy dir"
    );
}

#[test]
fn a_missing_legacy_folder_imports_nothing() {
    let config = tempfile::tempdir().unwrap();
    let missing = tempfile::tempdir().unwrap();
    let _lock = paths::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    unsafe {
        std::env::set_var("FASTSSH_CONFIG_DIR", config.path());
        std::env::set_var("FASTSSH_LEGACY_DIR", missing.path().join("nope"));
    }
    let report =
        import(&AppSettings::default(), &crypto()).expect("an absent folder is not an error");
    assert_eq!(report, ImportReport::default());
    unsafe {
        std::env::remove_var("FASTSSH_CONFIG_DIR");
        std::env::remove_var("FASTSSH_LEGACY_DIR");
    }
}
