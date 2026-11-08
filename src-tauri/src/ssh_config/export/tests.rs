//! Task 9.9 (export half): the managed section, the preserved blocks, and the
//! export -> parse -> import round trip.

use super::*;
use crate::ssh_config::import::import;
use crate::ssh_config::parse;
use crate::ssh_config::test_support::*;
use std::collections::HashSet;

#[test]
fn export_keeps_the_preamble_the_match_block_the_include_line_and_host_star() {
    let hosts = import(&parse(SAMPLE), &HashSet::new()).hosts;
    let text = export(SAMPLE, &hosts);

    let preamble = idx(&text, "ServerAliveInterval 30");
    let head = idx(&text, MANAGED_HEAD);
    let web1 = idx(&text, "Host web1");
    let end = idx(&text, MANAGED_END);
    let star = idx(&text, "Host *");
    assert!(preamble < head, "global lines come first");
    assert!(
        head < web1 && web1 < end,
        "hosts sit inside the managed section"
    );
    assert!(
        end < star,
        "ssh takes the first match, so specific hosts preced Host *"
    );
    assert!(text.contains("Host !negated *.corp"));
    assert!(text.contains("Match host *.internal"));
    assert!(text.contains("Include conf.d/*"));
    assert!(text.contains("    ServerAliveCountMax 3"));
    assert_eq!(
        lines(&text)
            .iter()
            .filter(|l| l.trim() == MANAGED_HEAD)
            .count(),
        1
    );
    assert!(!text.contains("secret"), "a password is never written");
}

#[test]
fn a_generated_block_has_the_spec_shape_and_the_tunnel_forwards() {
    let mut h = host("web9", "");
    h.host = "10.1.1.9".into();
    h.port = 2202;
    h.identity_file = "~/id 9".into();
    h.tunnels = "-L 8080:db:22".into();
    let text = export("", &[h]);
    let want = [
        MANAGED_HEAD,
        "",
        "Host web9",
        "    HostName 10.1.1.9",
        "    User ops",
        "    Port 2202",
        "    IdentityFile \"~/id 9\"",
        "    LocalForward 8080 db:22",
        MANAGED_END,
    ];
    assert_eq!(lines(&text), want.to_vec());
}

#[test]
fn sync_block_refreshes_the_managed_lines_and_keeps_comments_and_custom_lines() {
    let mut h = host(
        "db2",
        "Host db2 old\n# a note\n    ProxyJump web1\n    Port 22\n",
    );
    h.port = 2200;
    h.username = "postgres".into();
    h.identity_file = "~/key dir/id".into();
    let block = block_for(&h);
    assert_eq!(block.lines().next(), Some("Host db2"));
    assert!(block.contains("# a note"));
    assert!(block.contains("    ProxyJump web1"));
    assert!(block.contains("    Port 2200"));
    assert!(
        !block.contains("Port 22\n"),
        "the old Port line is replaced"
    );
    assert!(block.contains("    IdentityFile \"~/key dir/id\""));
}

#[test]
fn changing_a_port_rewrites_only_that_block() {
    let mut hosts = import(&parse(SAMPLE), &HashSet::new()).hosts;
    let db2 = hosts.iter_mut().find(|h| h.name == "db2").unwrap();
    db2.port = 2200;
    let text = export(SAMPLE, &hosts);
    assert!(text.contains("    Port 2200"));
    assert!(text.contains("    Port 2222"), "web1 keeps its port");
    let at = idx(&text, "Host db2");
    let block: Vec<&str> = text.lines().skip(at).take(4).collect();
    assert!(block.iter().any(|l| l.trim() == "Port 2200"));
}

#[test]
fn deleting_a_host_removes_its_block() {
    let hosts = import(&parse(SAMPLE), &HashSet::new()).hosts;
    assert!(export(SAMPLE, &hosts).contains("Host db10"));
    let rest: Vec<Host> = hosts.into_iter().filter(|h| h.name != "db10").collect();
    let text = export(SAMPLE, &rest);
    assert!(!text.contains("Host db10"));
    assert!(!text.contains("10.0.0.10"));
    assert!(text.contains("Host db2"));
}

#[test]
fn a_localhost_host_is_never_written() {
    let mut h = host("Localhost", "");
    h.local = Some(true);
    assert_eq!(export(SAMPLE, &[h]), export(SAMPLE, &[]));
}

#[test]
fn an_include_line_inside_a_dropped_block_survives() {
    let text = export("Host x\n    Include conf.d/x\n", &[host("x", "")]);
    assert!(text.contains("Include conf.d/x"));
}

#[test]
fn an_empty_or_marker_only_file_still_produces_a_managed_section() {
    let text = export("", &[host("a", "")]);
    assert_eq!(idx(&text, MANAGED_HEAD), 0);
    assert_eq!(idx(&text, "Host a"), 2);
    // A previous export's markers are not duplicated.
    let again = export(&text, &[host("a", "")]);
    assert_eq!(
        lines(&again)
            .iter()
            .filter(|l| l.trim() == MANAGED_HEAD)
            .count(),
        1
    );
    assert_eq!(again, text);
}

#[test]
fn export_parse_import_round_trip_is_stable() {
    let hosts = import(&parse(SAMPLE), &HashSet::new()).hosts;
    let once = export(SAMPLE, &hosts);
    let re = import(&parse(&once), &HashSet::new()).hosts;
    // The imported block keeps the file's own spelling (tabs, `Key=Value`), so
    // stability is measured from the exported text onwards.
    let strip = |h: &Host| {
        let mut c = h.clone();
        c.ssh_config = String::new();
        key(&c)
    };
    assert_eq!(
        re.iter().map(strip).collect::<Vec<_>>(),
        hosts.iter().map(strip).collect::<Vec<_>>(),
        "re-importing the exported file gives the same fields"
    );
    let twice = export(&once, &re);
    assert_eq!(twice, once, "a second export changes nothing");
    let re2 = import(&parse(&twice), &HashSet::new()).hosts;
    assert_eq!(
        re2.iter().map(key).collect::<Vec<_>>(),
        re.iter().map(key).collect::<Vec<_>>(),
        "and the same blocks"
    );
}
