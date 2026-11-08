use super::{Creds, build_ssh_line, parse_tunnel_flags, shell_quote};
use crate::models::Host;
use std::path::Path;

fn host(name: &str, addr: &str, port: u16) -> Host {
    Host {
        id: "h".into(),
        name: name.into(),
        group: "Lab".into(),
        host: addr.into(),
        port,
        username: "tester".into(),
        password: "secret-pass".into(),
        identity_file: "".into(),
        account: "".into(),
        color: "".into(),
        font: "".into(),
        tunnels: "".into(),
        extra_arguments: "".into(),
        ssh_config: "".into(),
        local: None,
    }
}

fn creds<'a>(h: &'a Host) -> Creds<'a> {
    Creds {
        username: &h.username,
        identity_file: &h.identity_file,
    }
}

#[test]
fn shell_quote_leaves_safe_values_bare() {
    assert_eq!(shell_quote("tester@127.0.0.1"), "tester@127.0.0.1");
    assert_eq!(shell_quote("2001:db8::1"), "2001:db8::1");
    assert_eq!(shell_quote("8080:localhost:80"), "8080:localhost:80");
}

#[test]
fn shell_quote_wraps_spaces_quotes_and_dollar() {
    assert_eq!(shell_quote("my server"), "'my server'");
    assert_eq!(shell_quote("$HOME"), "'$HOME'");
    assert_eq!(shell_quote("a;b|c&`x`"), "'a;b|c&`x`'");
    assert_eq!(shell_quote("it's"), r"'it'\''s'");
    assert_eq!(shell_quote(""), "''");
    assert_eq!(shell_quote("Сервер-1"), "'Сервер-1'");
}

#[test]
fn standard_line_omits_user_when_empty() {
    let h = host("item10", "127.0.0.1", 2222);
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh tester@127.0.0.1 -p 2222"
    );
    let no_user = Host {
        username: "".into(),
        ..h.clone()
    };
    assert_eq!(
        build_ssh_line(&no_user, &creds(&no_user), false, None).unwrap(),
        "ssh 127.0.0.1 -p 2222"
    );
}

#[test]
fn a_host_with_shell_metacharacters_is_quoted() {
    let h = host("odd", "10.0.0.1; rm -rf ~", 22);
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh 'tester@10.0.0.1; rm -rf ~' -p 22"
    );
}

#[test]
fn ipv6_address_stays_bare() {
    let h = host("v6", "2001:db8::1", 22);
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh tester@2001:db8::1 -p 22"
    );
}

#[test]
fn identity_is_expanded_and_quoted() {
    let home = std::env::var("HOME").expect("HOME");
    let mut h = host("item2", "127.0.0.1", 2222);
    h.identity_file = "~/fastssh-testenv/ssh/id_test".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        format!("ssh tester@127.0.0.1 -p 2222 -i {home}/fastssh-testenv/ssh/id_test")
    );
    // A path with a space is quoted, and quoting is why ~ must be expanded here.
    h.identity_file = "~/ssh/key dir/id_space".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        format!("ssh tester@127.0.0.1 -p 2222 -i '{home}/ssh/key dir/id_space'")
    );
    // An absolute path is used as written.
    h.identity_file = "/k/id".into();
    assert!(
        build_ssh_line(&h, &creds(&h), false, None)
            .unwrap()
            .ends_with("-i /k/id")
    );
}

#[test]
fn tunnels_become_flags() {
    let mut h = host("item10", "127.0.0.1", 2222);
    h.tunnels = "-L 18080:localhost:80,-R 9000:db:5432".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh tester@127.0.0.1 -p 2222 -L 18080:localhost:80 -R 9000:db:5432"
    );
    // Lowercase flags, a bare spec (local), spaces inside, brackets for IPv6.
    h.tunnels = "-l8080:localhost:80, 9000 : db : 22, -R 1:[::1]:22".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh tester@127.0.0.1 -p 2222 -L 8080:localhost:80 -L 9000:db:22 -R '1:[::1]:22'"
    );
    // Garbage is dropped instead of breaking the command.
    h.tunnels = "-X bogus, -L 0:db:22, -L 22:db:99999, -L 22:db".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), false, None).unwrap(),
        "ssh tester@127.0.0.1 -p 2222"
    );
    assert_eq!(parse_tunnel_flags("-S 1:2:3"), Vec::new());
}

#[test]
fn sync_mode_uses_the_name_and_keeps_extra_args() {
    let mut h = host("db-10", "10.0.0.1", 22);
    h.extra_arguments = "-o ConnectTimeout=5 -v".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), true, None).unwrap(),
        "ssh db-10 -o ConnectTimeout=5 -v"
    );
    h.name = "my server".into();
    assert_eq!(
        build_ssh_line(&h, &creds(&h), true, None).unwrap(),
        "ssh 'my server' -o ConnectTimeout=5 -v"
    );
    // Standard mode appends the extra arguments verbatim too.
    assert!(
        build_ssh_line(&h, &creds(&h), false, None)
            .unwrap()
            .ends_with("tester@10.0.0.1 -p 22 -o ConnectTimeout=5 -v")
    );
}

#[test]
fn sandbox_prefix_comes_first() {
    let h = host("item10", "127.0.0.1", 2222);
    let line = build_ssh_line(&h, &creds(&h), false, Some(Path::new("/tmp/ssh dir"))).unwrap();
    assert_eq!(
        line,
        "ssh -F '/tmp/ssh dir/config' -o 'UserKnownHostsFile=/tmp/ssh dir/known_hosts' \
         tester@127.0.0.1 -p 2222"
    );
    // Sync mode still honours the sandbox, so a test can never touch ~/.ssh.
    let sync = build_ssh_line(&h, &creds(&h), true, Some(Path::new("/tmp/s"))).unwrap();
    assert_eq!(
        sync,
        "ssh -F /tmp/s/config -o UserKnownHostsFile=/tmp/s/known_hosts item10"
    );
}

#[test]
fn rejects_a_zero_port_and_an_empty_host() {
    let h = host("bad", "127.0.0.1", 0);
    let err = build_ssh_line(&h, &creds(&h), false, None).unwrap_err();
    assert!(err.contains("port"), "{err}");
    let empty = host("bad", "   ", 22);
    let err = build_ssh_line(&empty, &creds(&empty), false, None).unwrap_err();
    assert!(err.contains("host"), "{err}");
    // Sync mode needs no address (ssh resolves the name from its config).
    assert!(build_ssh_line(&empty, &creds(&empty), true, None).is_ok());
}

#[test]
fn the_password_never_reaches_the_line() {
    let h = host("item10", "127.0.0.1", 2222);
    let line = build_ssh_line(&h, &creds(&h), false, None).unwrap();
    assert!(!line.contains("secret-pass"), "{line}");
}
