//! Two-way ~/.ssh/config sync: parser, importer, generator (R7, tasks 9.1-9.3).
//!
//! Pure text functions only - no I/O here, so every rule is unit-testable with
//! a string. `ssh_config_sync.rs` owns the file work (backup, atomic write).
//!
//! Layout (rule 7): this file is the parser and the shared line helpers,
//! `ssh_config/import.rs` is task 9.2, `ssh_config/export.rs` is task 9.3.
//!
//! Design (recorded as a deviation from spec 8.3, which regenerates the whole
//! file): ssh uses the FIRST matching value, so the managed Host blocks are
//! written before the user's wildcard/Match blocks, and everything the library
//! does not own (wildcards, negated patterns, Match, Include) is kept verbatim
//! in its original order.

pub mod export;
pub mod import;

use std::collections::HashSet;

pub use crate::ssh_config::export::{BlockFields, block_for, export, sync_block};
pub use crate::ssh_config::import::{ImportResult, import};

pub const MANAGED_HEAD: &str = "# >>> FastSSH managed hosts (edits here are overwritten) >>>";
pub const MANAGED_END: &str = "# <<< FastSSH managed hosts <<<";
pub const IMPORT_GROUP: &str = "SSHConfig";

#[derive(Clone, Debug, PartialEq)]
pub enum BlockKind {
    Preamble,
    Host,
    Match,
}

/// One section of the config file. `lines` are the raw lines, verbatim (only a
/// trailing CR is dropped), including the Host/Match line, comments and blanks.
#[derive(Clone, Debug)]
pub struct Block {
    pub kind: BlockKind,
    /// The patterns of a `Host` line; empty for Preamble and Match.
    pub patterns: Vec<String>,
    pub lines: Vec<String>,
}

pub fn is_comment(line: &str) -> bool {
    line.trim_start().starts_with('#')
}

/// Lowercased first token, split on whitespace AND on `=`, so "Key=Value"
/// (`HostName=10.0.0.10`) reads like "Key Value".
pub fn keyword(line: &str) -> String {
    let t = line.trim_start();
    let end = t
        .find(|c: char| c.is_whitespace() || c == '=')
        .unwrap_or(t.len());
    t[..end].to_lowercase()
}

/// Strips one pair of double quotes around a value (`"key dir/id"`).
pub fn unquote(v: &str) -> String {
    let v = v.trim();
    if v.len() > 1 && v.starts_with('"') && v.ends_with('"') {
        v[1..v.len() - 1].to_string()
    } else {
        v.to_string()
    }
}

/// A path or pattern with spaces must be quoted in the file.
pub fn quote_value(v: &str) -> String {
    if v.chars().any(char::is_whitespace) {
        format!("\"{v}\"")
    } else {
        v.to_string()
    }
}

/// The argument(s) after the keyword, unquoted. The separator may be spaces,
/// a `=`, or both (`User =  bob`, `HostName=10.0.0.10`).
pub fn value_of(line: &str) -> String {
    let t = line.trim_start();
    let end = t
        .find(|c: char| c.is_whitespace() || c == '=')
        .unwrap_or(t.len());
    let rest = t[end..].trim();
    unquote(rest.strip_prefix('=').unwrap_or(rest).trim())
}

/// True for a name ssh can connect with: no wildcard, no negation.
pub fn is_concrete(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.contains('*')
        && !pattern.contains('?')
        && !pattern.starts_with('!')
}

/// FastSSH's own section markers; they belong to the file, never to a block.
pub fn is_marker(line: &str) -> bool {
    let t = line.trim();
    t == MANAGED_HEAD || t == MANAGED_END
}

/// Split the file into blocks. Keywords are case-insensitive; comments and
/// blank lines stay in the block they appear in; CRLF is tolerated.
pub fn parse(text: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    for raw in text.split('\n') {
        let line = match raw.strip_suffix('\r') {
            Some(s) => s.to_string(),
            None => raw.to_string(),
        };
        let kw = keyword(&line);
        if !is_comment(&line) && kw == "host" {
            let patterns = value_of(&line).split_whitespace().map(unquote).collect();
            blocks.push(Block {
                kind: BlockKind::Host,
                patterns,
                lines: vec![line],
            });
        } else if !is_comment(&line) && kw == "match" {
            blocks.push(Block {
                kind: BlockKind::Match,
                patterns: vec![],
                lines: vec![line],
            });
        } else if let Some(b) = blocks.last_mut() {
            b.lines.push(line);
        } else {
            blocks.push(Block {
                kind: BlockKind::Preamble,
                patterns: vec![],
                lines: vec![line],
            });
        }
    }
    blocks
}

/// First value of a keyword inside a block ("identityfile" matches
/// `IdentityFile "path"` and `IdentityFile=path`).
pub fn field(block: &Block, key: &str) -> Option<String> {
    block
        .lines
        .iter()
        .find(|l| !is_comment(l) && keyword(l) == key)
        .map(|l| value_of(l))
        .filter(|v| !v.is_empty())
}

/// Names of the hosts a library already has (Localhost excluded), for import.
pub fn existing_names(hosts: &[crate::models::Host]) -> HashSet<String> {
    hosts
        .iter()
        .filter(|h| h.local != Some(true))
        .map(|h| h.name.clone())
        .collect()
}

#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;
