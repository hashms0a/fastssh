//! Shared fixture helpers for the ssh_config tests: the fixture is a copy of
//! the sandbox ssh config (`tools/make_fixtures.sh`) and deliberately holds the
//! awkward cases - a two-alias Host line, `Key=Value` syntax, a quoted path with
//! a space, a negated + wildcard pattern, Match, Include, and a trailing
//! `Host *` block.

use crate::models::Host;
use crate::ssh_config::IMPORT_GROUP;

pub(crate) const SAMPLE: &str = include_str!("../../tests/fixtures/ssh_config_sample");

pub(crate) fn host(name: &str, ssh_config: &str) -> Host {
    Host {
        id: format!("id-{name}"),
        name: name.to_string(),
        group: IMPORT_GROUP.to_string(),
        host: "10.0.0.1".to_string(),
        port: 22,
        username: "ops".to_string(),
        password: "secret".to_string(),
        identity_file: String::new(),
        account: String::new(),
        color: String::new(),
        font: String::new(),
        tunnels: String::new(),
        extra_arguments: String::new(),
        ssh_config: ssh_config.to_string(),
        local: None,
    }
}

/// ids are fresh UUIDs per import, so equality is checked field by field.
pub(crate) fn key(h: &Host) -> (String, String, String, u16, String, String, String, String) {
    (
        h.name.clone(),
        h.group.clone(),
        h.host.clone(),
        h.port,
        h.username.clone(),
        h.identity_file.clone(),
        h.tunnels.clone(),
        h.ssh_config.clone(),
    )
}

pub(crate) fn names(hosts: &[Host]) -> Vec<String> {
    hosts.iter().map(|h| h.name.clone()).collect()
}

pub(crate) fn lines(text: &str) -> Vec<String> {
    text.lines().map(str::to_string).collect()
}

pub(crate) fn idx(text: &str, needle: &str) -> usize {
    let at = lines(text).iter().position(|l| l.trim() == needle);
    at.unwrap_or_else(|| panic!("missing line {needle:?} in:\n{text}"))
}
