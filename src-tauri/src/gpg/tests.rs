//! Task 10.8: the gpg round trip against a throwaway `GNUPGHOME`.
//!
//! These tests spawn the real `gpg`; when the binary is missing they print a
//! note and pass, as the plan asks.

use super::*;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

/// A temp `GNUPGHOME` whose dir stays alive for the whole test.
struct Home {
    dir: tempfile::TempDir,
}

impl Home {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("temp GNUPGHOME");
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).expect("chmod 0700");
        Home { dir }
    }
    fn runner(&self) -> GpgRunner {
        GpgRunner::with_gnupg_home(self.dir.path())
    }
}

fn skip_if_missing(r: &GpgRunner) -> bool {
    if r.is_available() {
        return false;
    }
    println!("NOTE: gpg is not installed here; skipping the gpg round-trip tests.");
    true
}

fn gpg_file(dir: &Path, bytes: &[u8]) -> std::path::PathBuf {
    let p = dir.join("hosts.json.gpg");
    fs::write(&p, bytes).expect("write fixture");
    p
}

#[test]
fn a_round_trip_with_a_temp_gnupghome_returns_the_original_bytes() {
    let home = Home::new();
    let r = home.runner();
    if skip_if_missing(&r) {
        return;
    }
    let plain = br#"[{"name":"item10","password":"hunter2"}]"#.to_vec();
    let armored = r.encrypt(&plain, "test-passphrase-1").unwrap();
    let text = String::from_utf8(armored.clone()).expect("armored is UTF-8");
    assert!(
        text.starts_with("-----BEGIN PGP MESSAGE-----"),
        "expected armored output, got {text}"
    );
    assert!(
        !text.contains("hunter2"),
        "the ciphertext must not leak plaintext"
    );

    let file = gpg_file(home.dir.path(), &armored);
    assert_eq!(r.decrypt(&file, "test-passphrase-1").unwrap(), plain);
}

#[test]
fn a_wrong_passphrase_right_after_a_good_decrypt_is_wrong_passphrase() {
    let home = Home::new();
    let r = home.runner();
    if skip_if_missing(&r) {
        return;
    }
    let armored = r.encrypt(b"[{}]", "right-one").unwrap();
    let file = gpg_file(home.dir.path(), &armored);
    assert_eq!(r.decrypt(&file, "right-one").unwrap(), b"[{}]");
    // `--no-symkey-cache` is what makes this fail instead of succeeding from
    // the gpg-agent cache of the passphrase that just worked.
    assert_eq!(
        r.decrypt(&file, "wrong-one"),
        Err(GpgError::WrongPassphrase),
        "a cached passphrase would have decrypted this"
    );
    assert_eq!(
        r.decrypt(&file, "wrong-two"),
        Err(GpgError::WrongPassphrase),
        "and a second wrong try is still reported"
    );
    assert_eq!(r.decrypt(&file, "right-one").unwrap(), b"[{}]");
}

#[test]
fn the_fake_gpg_fixture_gives_a_clear_error_and_not_a_panic() {
    let home = Home::new();
    let r = home.runner();
    if skip_if_missing(&r) {
        return;
    }
    // Same bytes as ~/fastssh-testenv/bad/hosts.json.gpg.
    let file = gpg_file(home.dir.path(), b"not gpg data\n");
    let err = r.decrypt(&file, "whatever").expect_err("not OpenPGP data");
    assert!(
        matches!(err, GpgError::Failed(_)),
        "a corrupt file is a failure, not WrongPassphrase: {err:?}"
    );
    let msg = err.message();
    assert!(!msg.is_empty(), "the message must say something");
    assert!(
        msg.contains("OpenPGP") || msg.contains("decrypt_message"),
        "unexpected message: {msg}"
    );
}

#[test]
fn a_five_megabyte_payload_round_trips_without_deadlocking() {
    let home = Home::new();
    let r = home.runner();
    if skip_if_missing(&r) {
        return;
    }
    // Bigger than the 64 KiB pipe buffer: writing before reading would hang.
    let plain: Vec<u8> = (0..5 * 1024 * 1024).map(|i| (i % 251) as u8).collect();
    let armored = r.encrypt(&plain, "bulk-pass").expect("encrypt 5 MB");
    let file = gpg_file(home.dir.path(), &armored);
    let back = r.decrypt(&file, "bulk-pass").expect("decrypt 5 MB");
    assert_eq!(back.len(), plain.len());
    assert_eq!(back, plain);
}

#[test]
fn a_passphrase_with_a_newline_is_rejected_before_spawning() {
    let home = Home::new();
    let r = home.runner();
    assert!(
        matches!(
            r.prepare(Mode::Encrypt, None, "two\nlines", b"x"),
            Err(GpgError::BadPassphraseChars)
        ),
        "a newline must be refused before gpg is spawned"
    );
    assert!(
        matches!(
            r.prepare(Mode::Encrypt, None, "two\rlines", b"x"),
            Err(GpgError::BadPassphraseChars)
        ),
        "a carriage return too"
    );
    assert_eq!(
        r.encrypt(b"x", ""),
        Err(GpgError::BadPassphraseChars),
        "an empty passphrase would desync the stdin protocol"
    );
}

#[test]
fn the_passphrase_never_reaches_argv_or_the_environment() {
    let home = Home::new();
    let r = home.runner();
    let pass = "secret-in-stdin-only";
    for mode in [Mode::Encrypt, Mode::Decrypt] {
        let (cmd, stdin) = r
            .prepare(mode, Some(Path::new("/tmp/x.json.gpg")), pass, b"[]")
            .unwrap();
        let leaks = cmd
            .get_args()
            .chain(cmd.get_envs().map(|(k, _)| k))
            .any(|value| value.to_string_lossy().contains(pass));
        assert!(
            !leaks,
            "argv/env of the gpg command must not contain it: {cmd:?}"
        );
        assert!(
            String::from_utf8_lossy(&stdin).contains(pass),
            "the passphrase must be in the stdin payload"
        );
    }
    // The env the child does get is the sanitized one plus GNUPGHOME.
    let (cmd, _) = r.prepare(Mode::Encrypt, None, pass, b"[]").unwrap();
    let has_home = cmd
        .get_envs()
        .any(|(k, _)| k == "GNUPGHOME" || k == "HOME" || k == "PATH");
    assert!(has_home, "gpg needs PATH and a home");
    assert!(
        cmd.get_args().any(|a| a == "--no-symkey-cache"),
        "the plan's flags are mandated"
    );
}
