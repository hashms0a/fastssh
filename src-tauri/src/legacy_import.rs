//! Task 10.6 (R5): one-click import from the legacy EasySSH folder
//! (`~/.config/easyssh`, or `FASTSSH_LEGACY_DIR` in a test run).
//!
//! The folder is read with the Stage 1 lenient parsers, so kebab-case keys and
//! a port stored as a string work. Merging is by name: an existing name is
//! skipped and counted, a new name keeps the fresh id the parser gave it.
//! Nothing is ever written to the legacy folder.

use crate::crypto::LibraryCrypto;
use crate::error::AppError;
use crate::models::{self, Account, Bookmark, Host};
use crate::paths;
use crate::settings::AppSettings;
use crate::storage;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

/// What the UI shows: the three counts, the names that were skipped, and the
/// parser warnings (the log keeps all of them, the toast the first three).
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub hosts_added: usize,
    pub accounts_added: usize,
    pub bookmarks_added: usize,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

/// The fields the merge needs from all three record types.
trait Record {
    fn name(&self) -> &str;
    fn id(&self) -> &str;
    fn set_id(&mut self, id: String);
}

impl Record for Host {
    fn name(&self) -> &str {
        &self.name
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id;
    }
}

impl Record for Account {
    fn name(&self) -> &str {
        &self.name
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id;
    }
}

impl Record for Bookmark {
    fn name(&self) -> &str {
        &self.name
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id;
    }
}

/// Read one legacy file with a Stage 1 parser; bad records warn and are skipped.
fn read_records<T>(
    path: &Path,
    warnings: &mut Vec<String>,
    parse: fn(&Value, &mut Vec<String>) -> Option<T>,
) -> Vec<T> {
    storage::read_array(path, warnings)
        .iter()
        .filter_map(|v| parse(v, warnings))
        .collect()
}

/// Add `incoming` to `existing`, skipping names that are already there (in the
/// library or earlier in this same file) and giving a duplicated id a new one.
/// Returns how many records were added.
fn merge<T: Record>(existing: &mut Vec<T>, incoming: Vec<T>, skipped: &mut Vec<String>) -> usize {
    let mut names: HashSet<String> = existing.iter().map(|r| r.name().to_string()).collect();
    let mut ids: HashSet<String> = existing.iter().map(|r| r.id().to_string()).collect();
    let mut added = 0;
    for mut item in incoming {
        if item.id().is_empty() {
            item.set_id(uuid::Uuid::new_v4().to_string());
        }
        if names.contains(item.name()) {
            skipped.push(item.name().to_string());
            continue;
        }
        if ids.contains(item.id()) {
            item.set_id(uuid::Uuid::new_v4().to_string());
        }
        names.insert(item.name().to_string());
        ids.insert(item.id().to_string());
        existing.push(item);
        added += 1;
    }
    added
}

/// Import the legacy library into the current one and save what changed.
pub fn import(settings: &AppSettings, crypto: &LibraryCrypto) -> Result<ImportReport, AppError> {
    let legacy = paths::legacy_dir();
    let mut warnings: Vec<String> = vec![];
    let legacy_hosts = read_records(
        &legacy.join("hosts.json"),
        &mut warnings,
        models::host_from_value,
    );
    let legacy_accounts = read_records(
        &legacy.join("accounts.json"),
        &mut warnings,
        models::account_from_value,
    );
    let legacy_bookmarks = read_records(
        &legacy.join("bookmarks.json"),
        &mut warnings,
        models::bookmark_from_value,
    );

    // The library on disk is the base; the frontend's copy is identical because
    // every library edit saves immediately (Stage 1 rule).
    let current = storage::report_from(&storage::data_dir(settings)?, settings.clone(), crypto)?;
    let mut hosts = current.hosts.clone();
    let mut accounts = current.accounts.clone();
    let mut bookmarks = current.bookmarks.clone();

    let mut skipped = vec![];
    let hosts_added = merge(&mut hosts, legacy_hosts, &mut skipped);
    let accounts_added = merge(&mut accounts, legacy_accounts, &mut skipped);
    let bookmarks_added = merge(&mut bookmarks, legacy_bookmarks, &mut skipped);

    storage::save_hosts(settings, &hosts, crypto)?;
    storage::save_accounts(settings, &accounts, crypto)?;
    storage::save_bookmarks(settings, &bookmarks, crypto)?;

    let report = ImportReport {
        hosts_added,
        accounts_added,
        bookmarks_added,
        skipped,
        warnings,
    };
    log::info!(
        "easyssh import from {}: +{} hosts, +{} accounts, +{} bookmarks, {} skipped, {} warnings",
        legacy.display(),
        report.hosts_added,
        report.accounts_added,
        report.bookmarks_added,
        report.skipped.len(),
        report.warnings.len()
    );
    for w in &report.warnings {
        log::warn!("easyssh import: {w}");
    }
    Ok(report)
}

#[cfg(test)]
mod tests;
