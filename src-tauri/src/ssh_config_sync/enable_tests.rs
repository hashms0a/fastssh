//! Task 9.6: the enable flow, the export-on-save, and the case where the
//! config cannot be written while the library save still succeeds.

use super::*;
use crate::ssh_config_sync::test_env::*;

#[test]
fn enable_backs_up_imports_saves_the_library_and_exports() {
    let env = Env::new();
    fs::write(
        env.ssh.path().join("config"),
        include_str!("../../tests/fixtures/ssh_config_sample"),
    )
    .unwrap();
    let before = vec![host("keep1", 22), host("keep2", 22)];

    let report = enable(&env.settings(), &before).unwrap();
    assert_eq!(
        report
            .imported
            .iter()
            .map(|h| h.name.clone())
            .collect::<Vec<_>>(),
        vec!["web1", "web-alias", "db10", "db2", "bastion"]
    );
    assert!(report.skipped.is_empty());
    assert!(report.backup_path.is_some());

    let backup = PathBuf::from(report.backup_path.clone().unwrap());
    assert_eq!(
        fs::read(&backup).unwrap(),
        include_bytes!("../../tests/fixtures/ssh_config_sample"),
        "the backup is the original file"
    );

    let saved: serde_json::Value =
        serde_json::from_slice(&fs::read(env.config.path().join("hosts.json")).unwrap()).unwrap();
    let names: Vec<&str> = saved
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        vec![
            "keep1",
            "keep2",
            "web1",
            "web-alias",
            "db10",
            "db2",
            "bastion"
        ]
    );

    let text = fs::read_to_string(env.ssh.path().join("config")).unwrap();
    assert!(
        text.contains("ServerAliveInterval 30"),
        "the preamble survives"
    );
    assert!(text.contains("Host web1"));
    assert!(text.contains("Match host *.internal"));
    assert!(text.contains("Host *"));
    assert!(!text.contains("hunter2"), "no password in the config");
    assert_eq!(mode_of(&env.ssh.path().join("config")), 0o600);
}

#[test]
fn enable_skips_names_that_already_exist_and_reimporting_adds_nothing() {
    let env = Env::new();
    fs::write(
        env.ssh.path().join("config"),
        "Host web1\n    HostName 127.0.0.1\n",
    )
    .unwrap();
    let report = enable(&env.settings(), &[host("web1", 2222)]).unwrap();
    assert!(report.imported.is_empty());
    assert_eq!(report.skipped, vec!["web1".to_string()]);

    // A second enable on the resulting library imports nothing new.
    let again = enable(&env.settings(), &report.hosts).unwrap();
    assert!(again.imported.is_empty());
    assert_eq!(again.skipped, vec!["web1".to_string()]);
}

#[test]
fn a_save_with_sync_on_rewrites_the_config() {
    let env = Env::new();
    fs::write(env.ssh.path().join("config"), "Host db2\n    Port 22\n").unwrap();
    save_hosts_and_sync(&env.settings(), &[host("db2", 2200)]).unwrap();
    let text = fs::read_to_string(env.ssh.path().join("config")).unwrap();
    assert!(text.contains("    Port 2200"));
    assert!(!text.contains("    Port 22\n"));
    assert!(
        fs::read(env.config.path().join("hosts.json"))
            .unwrap()
            .len()
            > 2
    );
}

#[test]
fn a_read_only_config_fails_the_export_but_the_hosts_save_still_succeeds() {
    let env = Env::new();
    fs::write(env.ssh.path().join("config"), "Host a\n").unwrap();
    fs::set_permissions(env.ssh.path(), fs::Permissions::from_mode(0o500)).unwrap();

    let result = save_hosts_and_sync(&env.settings(), &[host("a", 22)]);
    let warning = result.expect("the hosts save succeeds").expect("a warning");
    assert!(
        warning.contains(env.ssh.path().display().to_string().as_str()),
        "the warning names the path: {warning}"
    );
    assert!(warning.contains("Permission denied"));
    // The library is on disk, and the config still holds the old text.
    assert!(
        String::from_utf8_lossy(&fs::read(env.config.path().join("hosts.json")).unwrap())
            .contains("\"a\"")
    );
    assert_eq!(
        fs::read_to_string(env.ssh.path().join("config")).unwrap(),
        "Host a\n"
    );
}

#[test]
fn with_sync_off_a_save_leaves_the_config_alone() {
    let env = Env::new();
    fs::write(
        env.ssh.path().join("config"),
        "Host a\n    HostName 9.9.9.9\n",
    )
    .unwrap();
    let settings = AppSettings {
        sync_ssh_config: false,
        ..AppSettings::default()
    };
    let warning = save_hosts_and_sync(&settings, &[host("b", 22)]).unwrap();
    assert_eq!(warning, None);
    assert_eq!(
        fs::read_to_string(env.ssh.path().join("config")).unwrap(),
        "Host a\n    HostName 9.9.9.9\n"
    );
}
