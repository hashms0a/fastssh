//! Task 10.8: enable/disable/unlock/start-empty over temp dirs, so the owner's
//! `~/.config/fastssh` is never involved (rule 10). The gpg tests need the real
//! `gpg` and print a note when it is missing.

use super::*;
use crate::gpg::GpgRunner;
use crate::models::Host;
use crate::paths;
use crate::settings::AppSettings;
use crate::storage;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

struct Env {
    config: TempDir,
    gpg_home: TempDir,
    _lock: std::sync::MutexGuard<'static, ()>,
}

impl Env {
    fn new() -> Self {
        let config = tempfile::tempdir().expect("config dir");
        let gpg_home = tempfile::tempdir().expect("GNUPGHOME");
        fs::set_permissions(gpg_home.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let _lock = paths::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: ENV_LOCK serializes every test that touches the environment.
        unsafe {
            std::env::set_var("FASTSSH_CONFIG_DIR", config.path());
        }
        Env {
            config,
            gpg_home,
            _lock,
        }
    }

    fn dir(&self) -> &Path {
        self.config.path()
    }

    fn runner(&self) -> GpgRunner {
        GpgRunner::with_gnupg_home(self.gpg_home.path())
    }

    fn crypto(&self) -> LibraryCrypto {
        LibraryCrypto::new(std::sync::Arc::new(self.runner()))
    }

    fn unlocked(&self, pass: &str) -> LibraryCrypto {
        LibraryCrypto::with_passphrase(std::sync::Arc::new(self.runner()), pass)
    }

    fn skip_without_gpg(&self) -> bool {
        if self.runner().is_available() {
            return false;
        }
        println!("NOTE: gpg is not installed here; skipping the encryption test.");
        true
    }

    fn write_library(&self) {
        fs::write(
            self.dir().join("hosts.json"),
            br#"[{"id":"h1","name":"web1","host":"10.0.0.1","port":"22","username":"ops","password":"hunter2"}]"#,
        )
        .unwrap();
        fs::write(
            self.dir().join("accounts.json"),
            b"[{\"id\":\"a1\",\"name\":\"lab\"}]",
        )
        .unwrap();
        fs::write(
            self.dir().join("bookmarks.json"),
            b"[{\"id\":\"b1\",\"name\":\"uptime\"}]",
        )
        .unwrap();
    }

    fn exists(&self, name: &str) -> bool {
        self.dir().join(name).exists()
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        // SAFETY: paired with the set_var in new().
        unsafe { std::env::remove_var("FASTSSH_CONFIG_DIR") };
    }
}

/// A gpg stand-in whose decrypt answer is always different from what it
/// "encrypted", so the verify branch can be tested on demand.
fn fake_gpg(dir: &Path) -> PathBuf {
    let p = dir.join("fake-gpg.sh");
    fs::write(
        &p,
        "#!/bin/sh\nfor a in \"$@\"; do\n  if [ \"$a\" = \"--decrypt\" ]; then printf 'different-bytes'; exit 0; fi\ndone\nprintf -- '-----BEGIN PGP MESSAGE-----\\nfake\\n'\n",
    )
    .unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
    p
}

fn armored(bytes: &[u8]) -> bool {
    String::from_utf8_lossy(bytes).starts_with("-----BEGIN PGP MESSAGE-----")
}

#[test]
fn enable_writes_the_three_gpg_files_and_removes_the_plain_copies() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    enable(&AppSettings::default(), &env.unlocked("test-passphrase-1")).expect("enable");

    for name in ["hosts", "accounts", "bookmarks"] {
        let enc = env.dir().join(format!("{name}.json.gpg"));
        assert!(enc.exists(), "{name}.json.gpg is missing");
        assert!(
            armored(&fs::read(&enc).unwrap()),
            "{name}.json.gpg is not armored"
        );
        assert_eq!(
            fs::metadata(&enc).unwrap().permissions().mode() & 0o777,
            0o600,
            "{name}.json.gpg mode"
        );
        assert!(
            !env.exists(&format!("{name}.json")),
            "{name}.json should be gone"
        );
    }
    // settings.json is never encrypted; here it was not even written.
    assert!(!env.exists("settings.json"));
}

#[test]
fn load_all_is_locked_without_the_passphrase_and_loads_with_it() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    enable(&AppSettings::default(), &env.unlocked("pw-one-two-three")).unwrap();

    let locked = storage::load_all(&env.crypto()).unwrap();
    assert!(
        locked.locked,
        "a *.json.gpg without a passphrase locks the library"
    );
    assert!(locked.hosts.is_empty(), "a locked report carries no data");
    assert!(
        locked
            .warnings
            .iter()
            .any(|w| w.contains("hosts.json.gpg") && w.contains("passphrase")),
        "warnings: {:?}",
        locked.warnings
    );
    // The settings still come through, so the theme and window size apply
    // while the modal is up.
    assert_eq!(
        locked.settings.schema_version,
        crate::settings::SCHEMA_VERSION
    );

    let open = storage::load_all(&env.unlocked("pw-one-two-three")).unwrap();
    assert!(!open.locked);
    assert_eq!(open.hosts.len(), 1);
    assert_eq!(open.hosts[0].name, "web1");
    assert_eq!(
        open.hosts[0].password, "hunter2",
        "the password round-trips"
    );
    assert_eq!(open.accounts.len(), 1);
    assert_eq!(open.bookmarks.len(), 1);
}

#[test]
fn disable_writes_the_plain_files_verifies_them_and_removes_the_gpg_files() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    let before = fs::read(env.dir().join("hosts.json")).unwrap();
    enable(&AppSettings::default(), &env.unlocked("both-ways-work")).unwrap();

    // settings.json stays plain even with encryptData on.
    let settings = AppSettings {
        encrypt_data: true,
        ..AppSettings::default()
    };
    storage::save_settings(&settings).unwrap();
    let text = fs::read_to_string(env.dir().join("settings.json")).unwrap();
    assert!(
        text.contains("\"encryptData\": true"),
        "settings.json must stay plain JSON: {text}"
    );
    assert!(
        !env.exists("settings.json.gpg"),
        "settings.json is never encrypted"
    );

    disable(&settings, &env.unlocked("both-ways-work")).expect("disable");
    assert_eq!(fs::read(env.dir().join("hosts.json")).unwrap(), before);
    for name in ["hosts", "accounts", "bookmarks"] {
        assert!(
            !env.exists(&format!("{name}.json.gpg")),
            "{name}.json.gpg should be gone"
        );
    }
    assert!(env.exists("settings.json"));
    assert!(
        !storage::load_all(&env.crypto()).unwrap().locked,
        "plain files are not locked"
    );
}

#[test]
fn a_save_with_encryption_on_rewrites_the_gpg_and_leaves_no_plain_file() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    let settings = AppSettings {
        encrypt_data: true,
        ..AppSettings::default()
    };
    enable(&AppSettings::default(), &env.unlocked("save-pass-123")).unwrap();

    let host = Host {
        id: "h9".into(),
        name: "db2".into(),
        host: "10.0.0.2".into(),
        port: 22,
        ..Host::default()
    };
    storage::save_hosts(&settings, &[host], &env.unlocked("save-pass-123")).expect("save");

    let cipher = fs::read(env.dir().join("hosts.json.gpg")).unwrap();
    assert!(armored(&cipher));
    let plain = env
        .runner()
        .decrypt(&env.dir().join("hosts.json.gpg"), "save-pass-123")
        .unwrap();
    let text = String::from_utf8(plain).unwrap();
    assert!(
        text.contains("\"name\":\"db2\"") || text.contains("\"name\": \"db2\""),
        "{text}"
    );
    assert!(!env.exists("hosts.json"), "the plain file is scrubbed away");
}

#[test]
fn a_save_with_encryption_on_and_no_passphrase_is_reported_as_locked() {
    let env = Env::new();
    env.write_library();
    let settings = AppSettings {
        encrypt_data: true,
        ..AppSettings::default()
    };
    let err = storage::save_hosts(&settings, &[], &env.crypto()).expect_err("no passphrase");
    assert_eq!(err.code, "locked");
    assert!(err.message.contains("passphrase"), "{}", err.message);
    // The plain file was not replaced by an empty array.
    assert!(
        fs::read_to_string(env.dir().join("hosts.json"))
            .unwrap()
            .contains("web1")
    );
    assert!(
        !env.exists("hosts.json.gpg"),
        "nothing encrypted was written"
    );
}

#[test]
fn a_wrong_passphrase_is_reported_and_nothing_is_stored() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    enable(&AppSettings::default(), &env.unlocked("the-right-one")).unwrap();
    let cipher = fs::read(env.dir().join("hosts.json.gpg")).unwrap();

    let err = unlock(&env.unlocked("the-wrong-one")).expect_err("wrong passphrase");
    assert_eq!(err.code, "wrong_passphrase");
    assert!(
        env.exists("hosts.json.gpg"),
        "the library is still encrypted"
    );
    assert_eq!(
        fs::read(env.dir().join("hosts.json.gpg")).unwrap(),
        cipher,
        "a failed unlock changed nothing"
    );
    assert!(!env.exists("hosts.json"), "no plain file was recreated");
}

#[test]
fn the_fake_gpg_file_gives_a_readable_error_naming_the_file() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    // Same bytes as ~/fastssh-testenv/bad/hosts.json.gpg.
    fs::write(env.dir().join("hosts.json.gpg"), b"not gpg data\n").unwrap();
    let err = unlock(&env.unlocked("anything")).expect_err("not OpenPGP data");
    assert_eq!(err.code, "gpg");
    assert!(
        err.message.contains("hosts.json.gpg"),
        "the message must name the file: {}",
        err.message
    );
    assert!(!err.message.is_empty());
    assert!(
        !err.message.contains("anything"),
        "the passphrase must not appear in the error: {}",
        err.message
    );
}

#[test]
fn start_empty_sets_the_unreadable_encrypted_file_aside() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    fs::write(env.dir().join("hosts.json.gpg"), b"not gpg data\n").unwrap();
    fs::write(
        env.dir().join("accounts.json"),
        b"[{\"id\":\"a1\",\"name\":\"lab\"}]",
    )
    .unwrap();

    let report = start_empty(&env.crypto()).expect("start empty");
    assert!(
        !report.locked,
        "the unreadable file is gone, so nothing is locked"
    );
    assert!(report.hosts.is_empty());
    assert_eq!(report.accounts.len(), 1, "the plain file is still read");

    let aside: Vec<String> = fs::read_dir(env.dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with("hosts.json.gpg."))
        .collect();
    assert_eq!(
        aside.len(),
        1,
        "the file was renamed aside, not deleted: {aside:?}"
    );
    assert!(!env.exists("hosts.json.gpg"));
    assert_eq!(
        fs::read(env.dir().join(&aside[0])).unwrap(),
        b"not gpg data\n",
        "its bytes survive"
    );
}

#[test]
fn a_failing_verify_step_leaves_every_file_as_it_was() {
    let env = Env::new();
    env.write_library();
    let script = fake_gpg(env.dir());
    let mut crypto = LibraryCrypto::new(std::sync::Arc::new(GpgRunner::with_program(script, None)));
    crypto.passphrase = Some("whatever".into());

    let err = enable(&AppSettings::default(), &crypto).expect_err("decrypt answers differently");
    assert_eq!(err.code, "verify");
    assert!(err.message.contains("hosts.json.gpg"), "{}", err.message);
    // Nothing was removed, and the half-written .gpg files were cleaned up.
    for name in ["hosts", "accounts", "bookmarks"] {
        assert!(env.exists(&format!("{name}.json")), "{name}.json must stay");
        assert!(
            !env.exists(&format!("{name}.json.gpg")),
            "{name}.json.gpg must be removed"
        );
    }
    assert!(
        fs::read_to_string(env.dir().join("hosts.json"))
            .unwrap()
            .contains("hunter2")
    );
}

#[test]
fn enable_and_disable_need_a_passphrase() {
    let env = Env::new();
    env.write_library();
    let err = enable(&AppSettings::default(), &env.crypto()).expect_err("no passphrase");
    assert_eq!(err.code, "bad_passphrase");
    let err = disable(&AppSettings::default(), &env.crypto()).expect_err("no passphrase");
    assert_eq!(err.code, "bad_passphrase");
    assert!(env.exists("hosts.json"), "nothing changed");
}

#[test]
fn gpg_name_and_has_encrypted_see_the_encrypted_forms() {
    assert_eq!(gpg_name("hosts.json"), "hosts.json.gpg");
    let env = Env::new();
    assert!(!has_encrypted(env.dir()));
    env.write_library();
    assert!(!has_encrypted(env.dir()));
    fs::write(env.dir().join("bookmarks.json.gpg"), b"x").unwrap();
    assert!(has_encrypted(env.dir()));
}
