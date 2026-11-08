//! Task 9.3: rebuild `~/.ssh/config` from the library.
//!
//! Order: the file's global lines, the managed section, then every block the
//! library does not own, verbatim and in original order. Concrete Host blocks
//! of the old file are dropped because the library now owns them (they were
//! imported when sync was enabled) - which is why a host deleted in FastSSH
//! disappears from the config.

use crate::models::Host;
use crate::ssh_command::parse_tunnel_flags;
use crate::ssh_config::{
    Block, BlockKind, MANAGED_END, MANAGED_HEAD, is_concrete, is_marker, keyword, quote_value,
};

/// The managed lines of one host (mirrors `src/lib/sshConfigBlock.ts` so the
/// editor preview and the exported file agree).
pub struct BlockFields<'a> {
    pub name: &'a str,
    pub host: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub identity_file: &'a str,
    /// e.g. "LocalForward 18080 localhost:80".
    pub forwards: Vec<String>,
}

const MANAGED_KEYS: [&str; 5] = ["host", "hostname", "user", "port", "identityfile"];

fn is_forward_kw(kw: &str) -> bool {
    kw == "localforward" || kw == "remoteforward"
}

/// Rewrite only the managed lines and the forward group, keep every other line
/// (comments included) in order. Managed lines come first, in a fixed order.
pub fn sync_block(block: &str, f: &BlockFields) -> String {
    let mut head = vec![format!("Host {}", f.name.trim())];
    if !f.host.trim().is_empty() {
        head.push(format!("    HostName {}", f.host.trim()));
    }
    if !f.username.trim().is_empty() {
        head.push(format!("    User {}", f.username.trim()));
    }
    head.push(format!("    Port {}", f.port));
    if !f.identity_file.trim().is_empty() {
        head.push(format!(
            "    IdentityFile {}",
            quote_value(f.identity_file.trim())
        ));
    }
    let mut others: Vec<&str> = block
        .lines()
        .filter(|l| !is_marker(l))
        .filter(|l| !MANAGED_KEYS.contains(&keyword(l).as_str()) && !is_forward_kw(&keyword(l)))
        .collect();
    while others.last().is_some_and(|l| l.trim().is_empty()) {
        others.pop();
    }
    let mut out = head;
    out.extend(f.forwards.iter().map(|x| format!("    {x}")));
    out.extend(others.iter().map(|l| l.to_string()));
    out.join("\n")
}

/// `LocalForward 8080 db:22` / `RemoteForward 9000 host:5432` from `Host.tunnels`.
fn forward_line(flag: char, spec: &str) -> String {
    let first = spec.find(':').unwrap_or(0);
    let last = spec.rfind(':').unwrap_or(0);
    let src = &spec[..first];
    let dest = &spec[first + 1..last];
    let dport = &spec[last + 1..];
    let kw = if flag == 'R' {
        "RemoteForward"
    } else {
        "LocalForward"
    };
    format!("{kw} {src} {dest}:{dport}")
}

/// The block FastSSH writes for one host: its own (normalised) block when it
/// has one, otherwise the spec 8.3 shape plus the tunnel forwards.
pub fn block_for(host: &Host) -> String {
    sync_block(
        &host.ssh_config,
        &BlockFields {
            name: &host.name,
            host: &host.host,
            port: host.port,
            username: &host.username,
            identity_file: &host.identity_file,
            forwards: parse_tunnel_flags(&host.tunnels)
                .iter()
                .map(|(flag, spec)| forward_line(*flag, spec))
                .collect(),
        },
    )
}

/// A block FastSSH must not touch: any wildcard or negated pattern, every
/// Match block, and a Host line without patterns.
fn keep_verbatim(b: &Block) -> bool {
    b.kind == BlockKind::Match
        || b.patterns.is_empty()
        || b.patterns.iter().any(|p| !is_concrete(p))
}

/// Collapse runs of blank lines, drop leading/trailing blanks.
fn tidy(lines: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in lines {
        if l.trim().is_empty()
            && (out.is_empty() || out.last().is_some_and(|p| p.trim().is_empty()))
        {
            continue;
        }
        out.push(l.clone());
    }
    while out.last().is_some_and(|l| l.trim().is_empty()) {
        out.pop();
    }
    out
}

pub fn export(existing: &str, hosts: &[Host]) -> String {
    let blocks = if existing.trim().is_empty() {
        Vec::new()
    } else {
        crate::ssh_config::parse(existing)
    };
    let mut lines: Vec<String> = Vec::new();
    for b in blocks.iter().take_while(|b| b.kind == BlockKind::Preamble) {
        lines.extend(b.lines.iter().filter(|l| !is_marker(l)).cloned());
    }
    lines.push(MANAGED_HEAD.to_string());
    for h in hosts.iter().filter(|h| h.local != Some(true)) {
        lines.push(String::new());
        lines.extend(block_for(h).split('\n').map(str::to_string));
    }
    lines.push(MANAGED_END.to_string());
    for b in blocks.iter().filter(|b| b.kind != BlockKind::Preamble) {
        if keep_verbatim(b) {
            lines.push(String::new());
            lines.extend(b.lines.iter().filter(|l| !is_marker(l)).cloned());
        } else {
            // The library owns this block; only its Include lines stay global.
            for l in b.lines.iter().filter(|l| keyword(l) == "include") {
                lines.push(String::new());
                lines.push(l.clone());
            }
        }
    }
    let mut out = tidy(&lines).join("\n");
    out.push('\n');
    out
}

#[cfg(test)]
mod tests;
