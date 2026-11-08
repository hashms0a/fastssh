//! Stage 11 (P2) tests: one backup file over a temp folder, so the owner's
//! `~/.config/fastssh` is never involved (rule 10). The gpg case needs the
//! real `gpg` and prints a note when it is missing.

use super::*;
use crate::crypto::LibraryCrypto;
use crate::gpg::GpgRunner;
use crate::paths;
use crate::settings::AppSettings;
use std::fs;
use std::os::unix::fs::PermissionsExt;
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

    fn dir(&self) -> PathBuf {
        self.config.path().to_path_buf()
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

    fn settings(&self) -> AppSettings {
        AppSettings::default()
    }

    fn write_library(&self) {
        fs::write(
            self.dir().join("hosts.json"),
            br#"[{"id":"h1","name":"web1","group":"Lab","host":"10.0.0.1","port":"2222","username":"ops","password":"hunter2","tunnels":"-L 18080:localhost:80"}]"#,
        )
        .unwrap();
        fs::write(
            self.dir().join("accounts.json"),
            br#"[{"id":"a1","name":"lab"}]"#,
        )
        .unwrap();
        fs::write(
            self.dir().join("bookmarks.json"),
            br#"[{"id":"b1","name":"uptime","command":"uptime"}]"#,
        )
        .unwrap();
    }

    fn skip_without_gpg(&self) -> bool {
        if self.runner().is_available() {
            return false;
        }
        println!("NOTE: gpg is not installed here; skipping the encrypted-backup test.");
        true
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        // SAFETY: paired with the set_var in new().
        unsafe { std::env::remove_var("FASTSSH_CONFIG_DIR") };
    }
}

#[test]
fn stamp_formats_a_unix_second_in_utc() {
    assert_eq!(stamp(0), "19700101-000000");
    assert_eq!(stamp(1_700_000_000), "20231114-221320");
    // 11016 days after the epoch, on the leap day of 2000.
    assert_eq!(stamp(951_789_600), "20000229-020000");
}

#[test]
fn file_name_marks_the_encrypted_copy() {
    assert_eq!(
        file_name("20261108-140731", false),
        "fastssh-library-20261108-140731.json"
    );
    assert_eq!(
        file_name("20261108-140731", true),
        "fastssh-library-20261108-140731.json.gpg"
    );
}

#[test]
fn a_backup_is_one_json_object_with_the_three_arrays() {
    let env = Env::new();
    env.write_library();
    let out = export(&env.settings(), &env.crypto(), None, 1_700_000_000).expect("export");
    assert!(!out.encrypted);
    assert_eq!((out.hosts, out.accounts, out.bookmarks), (1, 1, 1));

    let text = fs::read_to_string(&out.path).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(doc["app"], "FastSSH");
    assert_eq!(doc["schemaVersion"], SCHEMA_VERSION);
    assert_eq!(doc["exportedAt"], "20231114-221320");
    assert_eq!(doc["hosts"].as_array().unwrap().len(), 1);
    assert_eq!(doc["hosts"][0]["name"], "web1");
    assert_eq!(doc["hosts"][0]["port"], "2222", "the on-disk record shape");
    assert_eq!(doc["hosts"][0]["identity-file"], "");
    assert_eq!(doc["accounts"][0]["name"], "lab");
    assert_eq!(doc["bookmarks"][0]["command"], "uptime");
}

#[test]
fn a_backup_lands_in_the_backups_folder_with_private_modes() {
    let env = Env::new();
    env.write_library();
    let out = export(&env.settings(), &env.crypto(), None, 1_700_000_000).expect("export");
    let path = PathBuf::from(&out.path);
    assert_eq!(path.parent().unwrap().file_name().unwrap(), BACKUP_DIR);
    assert_eq!(path.parent().unwrap(), env.dir().join(BACKUP_DIR));
    assert_eq!(
        fs::metadata(path.parent().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o700
    );
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
}

#[test]
fn an_existing_target_is_refused_and_left_alone() {
    let env = Env::new();
    env.write_library();
    let target = env.dir().join("mine.json");
    fs::write(&target, b"my own file").unwrap();
    let err = export(
        &env.settings(),
        &env.crypto(),
        Some(target.display().to_string()),
        1,
    )
    .unwrap_err();
    assert_eq!(err.code, "exists");
    assert!(err.message.contains("mine.json"));
    assert_eq!(fs::read_to_string(&target).unwrap(), "my own file");
}

#[test]
fn an_encrypted_library_without_the_passphrase_is_not_backed_up() {
    let env = Env::new();
    fs::write(env.dir().join("hosts.json.gpg"), b"not gpg data").unwrap();
    let err = export(&env.settings(), &env.crypto(), None, 1).unwrap_err();
    assert_eq!(err.code, "locked");
    assert!(
        !env.dir().join(BACKUP_DIR).exists(),
        "no half-written backup"
    );
}

#[test]
fn an_encrypted_backup_is_armored_and_named_with_the_gpg_suffix() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    let settings = AppSettings {
        encrypt_data: true,
        ..AppSettings::default()
    };
    let out = export(
        &settings,
        &env.unlocked("test-passphrase-1"),
        None,
        1_700_000_000,
    )
    .expect("export");
    assert!(out.encrypted);
    assert!(out.path.ends_with(".json.gpg"));
    let text = fs::read_to_string(&out.path).unwrap();
    assert!(text.starts_with("-----BEGIN PGP MESSAGE-----"));

    let back = env
        .runner()
        .decrypt(PathBuf::from(&out.path).as_path(), "test-passphrase-1")
        .expect("the backup decrypts");
    let doc: serde_json::Value = serde_json::from_slice(&back).unwrap();
    assert_eq!(doc["hosts"][0]["name"], "web1");
    assert_eq!(doc["hosts"][0]["password"], "hunter2");
}

#[test]
fn a_chosen_path_gets_the_gpg_suffix_when_encryption_is_on() {
    let env = Env::new();
    if env.skip_without_gpg() {
        return;
    }
    env.write_library();
    let settings = AppSettings {
        encrypt_data: true,
        ..AppSettings::default()
    };
    let target = env.dir().join("copy-of-library.json");
    let out = export(
        &settings,
        &env.unlocked("test-passphrase-1"),
        Some(target.display().to_string()),
        1_700_000_000,
    )
    .expect("export");
    assert_eq!(out.path, target.display().to_string() + ".gpg");
    assert!(!target.exists(), "no ciphertext under a plain name");
}
