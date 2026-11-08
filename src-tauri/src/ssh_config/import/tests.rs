//! Task 9.9 (import half): the concrete patterns become hosts; everything the
//! library cannot own is ignored, and a name already in the library is skipped.

use crate::ssh_config::import::import;
use crate::ssh_config::parse;
use crate::ssh_config::test_support::*;
use std::collections::HashSet;

#[test]
fn imports_the_concrete_hosts_with_the_mapped_fields() {
    let res = import(&parse(SAMPLE), &HashSet::new());
    assert_eq!(
        names(&res.hosts),
        vec!["web1", "web-alias", "db10", "db2", "bastion"]
    );
    assert!(res.skipped.is_empty());

    let web1 = &res.hosts[0];
    assert_eq!(web1.group, "SSHConfig");
    assert_eq!(web1.host, "127.0.0.1");
    assert_eq!(web1.port, 2222);
    assert_eq!(web1.username, "keyuser");
    assert_eq!(
        web1.identity_file, "~/fastssh-testenv/ssh/id_test",
        "tilde kept"
    );
    assert_eq!(web1.password, "", "never a password from ssh_config");
    assert_eq!(
        web1.ssh_config.lines().next(),
        Some("Host web1"),
        "one pattern per host"
    );
    assert!(
        web1.ssh_config
            .contains("    IdentityFile ~/fastssh-testenv/ssh/id_test")
    );

    // The alias is a full copy: ssh treats `Host web1 web-alias` that way.
    assert_eq!(res.hosts[1].host, "127.0.0.1");
    assert_eq!(
        res.hosts[1].ssh_config.lines().next(),
        Some("Host web-alias")
    );

    let db10 = &res.hosts[2];
    assert_eq!(
        (db10.host.as_str(), db10.username.as_str(), db10.port),
        ("10.0.0.10", "postgres", 22)
    );
    let db2 = &res.hosts[3];
    assert_eq!(db2.host, "10.0.0.2");
    assert_eq!(db2.identity_file, "~/fastssh-testenv/ssh/key dir/id_space");
    // A line FastSSH does not manage is kept in the block.
    assert!(res.hosts[4].ssh_config.contains("ProxyJump web1"));
}

#[test]
fn import_skips_wildcards_negated_patterns_match_and_host_star() {
    let res = import(&parse(SAMPLE), &HashSet::new());
    for bad in ["*", "*.corp", "!negated", "conf.d/*", "*.internal"] {
        assert!(
            !names(&res.hosts).contains(&bad.to_string()),
            "imported {bad}"
        );
    }
}

#[test]
fn import_skips_names_that_already_exist() {
    let existing: HashSet<String> = ["web1".to_string(), "db10".to_string()]
        .into_iter()
        .collect();
    let res = import(&parse(SAMPLE), &existing);
    assert_eq!(names(&res.hosts), vec!["web-alias", "db2", "bastion"]);
    assert_eq!(res.skipped, vec!["web1".to_string(), "db10".to_string()]);
}

#[test]
fn an_existing_forward_becomes_a_tunnel_so_it_survives_the_export() {
    let res = import(
        &parse(
            "Host tunnel\n    LocalForward 18080 localhost:80\n    RemoteForward 9000 db:5432\n",
        ),
        &HashSet::new(),
    );
    assert_eq!(
        res.hosts[0].tunnels,
        "-L 18080:localhost:80,-R 9000:db:5432"
    );
    let text = crate::ssh_config::export::export("", &res.hosts);
    assert!(text.contains("    LocalForward 18080 localhost:80"));
    assert!(text.contains("    RemoteForward 9000 db:5432"));
}
