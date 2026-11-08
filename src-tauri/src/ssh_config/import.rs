//! Task 9.2: turn `~/.ssh/config` Host blocks into library hosts.
//!
//! Fixes the legacy EasySSH inverted null check (`if (file != null) return;`),
//! which made imports do nothing. One host per concrete pattern, so the
//! aliases of `Host web1 web-alias` both become hosts - that is how ssh
//! treats them. Wildcards, negated patterns and `Match` produce no host.

use crate::models::Host;
use crate::ssh_config::{Block, IMPORT_GROUP, field, is_comment, is_concrete, is_marker, keyword};
use std::collections::HashSet;

fn port_of(block: &Block) -> u16 {
    field(block, "port")
        .and_then(|v| v.trim().parse::<u16>().ok())
        .filter(|p| *p > 0)
        .unwrap_or(22)
}

/// `LocalForward 18080 localhost:80` -> `-L 18080:localhost:80`, so a forward
/// already in the file survives as a tunnel instead of being dropped on export
/// (the export rebuilds forwards from `tunnels`).
fn tunnels_from_block(block: &Block) -> String {
    let mut parts: Vec<String> = Vec::new();
    for l in &block.lines {
        if is_comment(l) {
            continue;
        }
        let flag = match keyword(l).as_str() {
            "localforward" => 'L',
            "remoteforward" => 'R',
            _ => continue,
        };
        let value = crate::ssh_config::value_of(l);
        let mut args = value.split_whitespace();
        let (src, dest) = match (args.next(), args.next()) {
            (Some(s), Some(d)) => (s, d),
            _ => continue,
        };
        parts.push(format!("-{flag} {src}:{dest}"));
    }
    parts.join(",")
}

/// The block with its Host line rewritten to this one pattern; the other lines
/// stay verbatim, so ProxyJump, comments and custom lines survive. FastSSH's
/// marker comments are dropped: they belong to the file, not to a host, and
/// re-importing an exported config must not push one into a block.
fn rewrite_host_line(block: &Block, pattern: &str) -> String {
    let mut out: Vec<String> = block
        .lines
        .iter()
        .filter(|l| !is_marker(l))
        .cloned()
        .collect();
    if let Some(l) = out
        .iter_mut()
        .find(|l| !is_comment(l) && keyword(l) == "host")
    {
        *l = format!("Host {pattern}");
    }
    out.join("\n")
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ImportResult {
    pub hosts: Vec<Host>,
    /// Host names that exist already in the library.
    pub skipped: Vec<String>,
}

pub fn import(blocks: &[Block], existing: &HashSet<String>) -> ImportResult {
    let mut taken: HashSet<String> = existing.clone();
    let mut res = ImportResult::default();
    for b in blocks
        .iter()
        .filter(|b| b.kind == crate::ssh_config::BlockKind::Host)
    {
        for pattern in &b.patterns {
            let name = pattern.trim().replace(' ', "-");
            if !is_concrete(pattern) || name.is_empty() {
                continue;
            }
            if !taken.insert(name.clone()) {
                res.skipped.push(name);
                continue;
            }
            res.hosts.push(Host {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                group: IMPORT_GROUP.to_string(),
                host: field(b, "hostname").unwrap_or_else(|| pattern.clone()),
                port: port_of(b),
                username: field(b, "user").unwrap_or_default(),
                // Never put a password in ssh_config (plan Stage 9 note).
                password: String::new(),
                identity_file: field(b, "identityfile").unwrap_or_default(),
                account: String::new(),
                color: String::new(),
                font: String::new(),
                tunnels: tunnels_from_block(b),
                extra_arguments: String::new(),
                ssh_config: rewrite_host_line(b, pattern),
                local: None,
            });
        }
    }
    res
}

#[cfg(test)]
mod tests;
