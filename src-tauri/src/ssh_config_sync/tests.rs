//! Tasks 9.4 and 9.5: the backup rules and the symlink-safe atomic write.

use super::*;
use crate::ssh_config_sync::test_env::*;

#[test]
fn the_backup_equals_the_original_byte_for_byte_and_keeps_its_mode() {
    let env = Env::new();
    let original = b"Host web1\n    HostName 127.0.0.1\n";
    fs::write(env.ssh.path().join("config"), original).unwrap();
    fs::set_permissions(
        env.ssh.path().join("config"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();

    let made = backup(env.ssh.path()).unwrap().expect("a backup path");
    assert_eq!(fs::read(&made).unwrap(), original);
    assert_eq!(mode_of(&made), 0o644, "the original mode is kept");
    assert!(
        fs::read(env.ssh.path().join("config")).unwrap() == original,
        "the config is untouched"
    );
}

#[test]
fn a_missing_config_makes_no_backup() {
    let env = Env::new();
    assert_eq!(backup(env.ssh.path()).unwrap(), None);
    assert!(!env.ssh.path().join("config.backup").exists());
}

#[test]
fn a_second_backup_goes_to_a_timestamped_file_and_leaves_the_first_alone() {
    let env = Env::new();
    let first = b"Host one\n";
    fs::write(env.ssh.path().join("config"), first).unwrap();
    let made1 = backup(env.ssh.path()).unwrap().unwrap();
    assert_eq!(made1.file_name().unwrap(), "config.backup");

    fs::write(env.ssh.path().join("config"), b"Host two\n").unwrap();
    let made2 = backup(env.ssh.path()).unwrap().unwrap();
    assert_ne!(made1, made2);
    assert!(
        made2
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("config.backup."),
        "second backup is timestamped: {made2:?}"
    );
    assert_eq!(
        fs::read(&made1).unwrap(),
        first,
        "the pristine original survives"
    );
    assert_eq!(fs::read(&made2).unwrap(), b"Host two\n");
}

#[test]
fn the_export_creates_a_missing_ssh_dir_as_0700_and_the_config_as_0600() {
    let env = Env::new();
    let fresh = env.config.path().join("ssh-new");
    write_config(&fresh, "Host a\n").unwrap();
    assert_eq!(mode_of(&fresh), 0o700);
    assert_eq!(
        mode_of(&fresh.join("config")),
        0o600,
        "ssh refuses a loose config"
    );
}

#[test]
fn a_symlinked_config_is_still_a_symlink_after_an_export() {
    let env = Env::new();
    let real = env.config.path().join("real-ssh-config");
    fs::write(&real, "Host old\n    HostName 1.2.3.4\n").unwrap();
    fs::set_permissions(&real, fs::Permissions::from_mode(0o600)).unwrap();
    std::os::unix::fs::symlink(&real, env.ssh.path().join("config")).unwrap();

    write_from_library(env.ssh.path(), &[host("web1", 22)]).unwrap();

    assert!(
        fs::symlink_metadata(env.ssh.path().join("config"))
            .unwrap()
            .is_symlink(),
        "the link is never replaced by a file"
    );
    let text = fs::read_to_string(&real).unwrap();
    assert!(text.contains(ssh_config::MANAGED_HEAD));
    assert!(text.contains("Host web1"));
    assert_eq!(mode_of(&real), 0o600);
}
