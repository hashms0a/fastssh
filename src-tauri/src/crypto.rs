//! Tasks 10.2/10.3: the encrypted library (`*.json.gpg`) and the enable,
//! disable, unlock and start-empty flows (R6).
//!
//! The passphrase lives in Rust only (`AppState.passphrase`). The frontend
//! sends it once, never keeps it in the store, and never logs it. It reaches
//! gpg through stdin (see `gpg.rs`), never argv or the environment.

use crate::error::AppError;
use crate::gpg::{GpgError, GpgRunner};
use crate::paths;
use crate::settings::AppSettings;
use crate::storage::{self, LIBRARY_FILES, LoadReport};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// What a read or write of the library needs: the gpg binary, and the
/// passphrase when the library has been unlocked. Owned fields so a blocking
/// file-I/O task can take it with the closure.
#[derive(Clone)]
pub struct LibraryCrypto {
    pub runner: Arc<GpgRunner>,
    pub passphrase: Option<String>,
}

impl LibraryCrypto {
    pub fn new(runner: Arc<GpgRunner>) -> Self {
        Self {
            runner,
            passphrase: None,
        }
    }

    /// The host `gpg` with no passphrase: what a plain library and the tests
    /// for unencrypted writes need.
    pub fn unencrypted() -> Self {
        Self::new(Arc::new(GpgRunner::system()))
    }

    pub fn with_passphrase(runner: Arc<GpgRunner>, pass: &str) -> Self {
        Self {
            runner,
            passphrase: Some(pass.to_string()),
        }
    }

    pub fn passphrase(&self) -> Option<&str> {
        self.passphrase.as_deref()
    }
}

/// `hosts.json` -> `hosts.json.gpg`.
pub fn gpg_name(name: &str) -> String {
    format!("{name}.gpg")
}

pub fn has_encrypted(dir: &Path) -> bool {
    LIBRARY_FILES.iter().any(|n| dir.join(gpg_name(n)).exists())
}

/// The command context for the current state (used by every command handler).
pub fn ctx(runner: &Arc<GpgRunner>, passphrase: Option<String>) -> LibraryCrypto {
    LibraryCrypto {
        runner: Arc::clone(runner),
        passphrase,
    }
}

/// The passphrase a write needs: encryption is on, so the library must be
/// unlocked. With encryption off a write stays plain.
pub fn passphrase_for<'a>(
    settings: &AppSettings,
    crypto: &'a LibraryCrypto,
) -> Result<Option<&'a str>, AppError> {
    if !settings.encrypt_data {
        return Ok(None);
    }
    match crypto.passphrase() {
        Some(pass) => Ok(Some(pass)),
        None => Err(AppError::new(
            "locked",
            "The library is encrypted. Enter the passphrase before saving.",
        )),
    }
}

fn gpg_error(e: GpgError, path: Option<&Path>) -> AppError {
    let code = match e {
        GpgError::NotInstalled => "gpg_missing",
        GpgError::WrongPassphrase => "wrong_passphrase",
        GpgError::BadPassphraseChars => "bad_passphrase",
        GpgError::Failed(_) => "gpg",
    };
    let message = match path {
        Some(p) => format!("{}: {}", p.display(), e.message()),
        None => e.message(),
    };
    AppError::new(code, message)
}

pub use scrub::scrub_and_remove;

/// Decrypt one `*.json.gpg` file.
pub fn read_bytes(path: &Path, crypto: &LibraryCrypto) -> Result<Vec<u8>, AppError> {
    let pass = crypto.passphrase().ok_or_else(|| {
        AppError::new(
            "locked",
            format!(
                "{} is encrypted; FastSSH needs the passphrase.",
                path.display()
            ),
        )
    })?;
    crypto
        .runner
        .decrypt(path, pass)
        .map_err(|e| gpg_error(e, Some(path)))
}

/// Write `bytes` as `<name>.json`, or as `<name>.json.gpg` (and remove the
/// plain file) when encryption is on.
pub fn write_file(
    plain_path: &Path,
    bytes: &[u8],
    crypto: &LibraryCrypto,
    settings: &AppSettings,
) -> Result<(), AppError> {
    let pass = passphrase_for(settings, crypto)?;
    match pass {
        None => storage::atomic_write(plain_path, bytes).map_err(|e| AppError::io(plain_path, e)),
        Some(pass) => {
            let cipher = crypto
                .runner
                .encrypt(bytes, pass)
                .map_err(|e| gpg_error(e, None))?;
            let name = plain_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "library.json".into());
            let enc = plain_path.with_file_name(gpg_name(&name));
            storage::atomic_write(&enc, &cipher).map_err(|e| AppError::io(&enc, e))?;
            scrub_and_remove(plain_path)
        }
    }
}

/// The bytes a file should keep after a re-encrypt: the plain file when it is
/// there, else what its `.gpg` currently holds, else an empty array.
fn current_bytes(dir: &Path, name: &str, crypto: &LibraryCrypto) -> Result<Vec<u8>, AppError> {
    let plain = dir.join(name);
    if let Ok(bytes) = fs::read(&plain) {
        return Ok(bytes);
    }
    let enc = dir.join(gpg_name(name));
    if enc.exists() {
        return read_bytes(&enc, crypto);
    }
    Ok(b"[]".to_vec())
}

/// Task 10.3 (enable): encrypt all three files, verify each by decrypting it
/// and comparing the bytes, and only then remove the plain files. A failure
/// anywhere leaves the library exactly as it was.
pub fn enable(settings: &AppSettings, crypto: &LibraryCrypto) -> Result<(), AppError> {
    let pass = crypto.passphrase().ok_or_else(|| {
        AppError::new(
            "bad_passphrase",
            "Type a passphrase; FastSSH needs it to encrypt the library.",
        )
    })?;
    let dir = storage::data_dir(settings)?;

    // Pass 1: encrypt + verify every file. Nothing is deleted yet.
    let mut written: Vec<PathBuf> = vec![];
    for name in LIBRARY_FILES {
        let bytes = current_bytes(&dir, name, crypto)?;
        let cipher = crypto
            .runner
            .encrypt(&bytes, pass)
            .map_err(|e| gpg_error(e, None))?;
        let enc = dir.join(gpg_name(name));
        storage::atomic_write(&enc, &cipher).map_err(|e| AppError::io(&enc, e))?;
        written.push(enc.clone());
        let back = crypto
            .runner
            .decrypt(&enc, pass)
            .map_err(|e| gpg_error(e, Some(&enc)))?;
        if back != bytes {
            for p in written {
                let _ = fs::remove_file(p);
            }
            return Err(AppError::new(
                "verify",
                format!(
                    "{} could not be decrypted again, so the plain files were kept",
                    enc.display()
                ),
            ));
        }
    }

    // Pass 2: every file round-tripped, so the plain copies can go.
    for name in LIBRARY_FILES {
        scrub_and_remove(&dir.join(name))?;
    }
    log::info!(
        "encryption enabled for {} files in {}",
        LIBRARY_FILES.len(),
        dir.display()
    );
    Ok(())
}

/// Task 10.3 (disable): decrypt with the current passphrase first
/// (all-or-nothing), write the plain files and verify them, then remove the
/// `.gpg` files.
pub fn disable(settings: &AppSettings, crypto: &LibraryCrypto) -> Result<(), AppError> {
    crypto.passphrase().ok_or_else(|| {
        AppError::new(
            "bad_passphrase",
            "Type the current passphrase; FastSSH needs it to decrypt the library.",
        )
    })?;
    let dir = storage::data_dir(settings)?;

    let mut decrypted: Vec<(String, Vec<u8>)> = vec![];
    for name in LIBRARY_FILES {
        let enc = dir.join(gpg_name(name));
        if enc.exists() {
            decrypted.push((name.to_string(), read_bytes(&enc, crypto)?));
        }
    }
    for (name, bytes) in &decrypted {
        let plain = dir.join(name);
        storage::atomic_write(&plain, bytes).map_err(|e| AppError::io(&plain, e))?;
        let back = fs::read(&plain).map_err(|e| AppError::io(&plain, e))?;
        if &back != bytes {
            return Err(AppError::new(
                "verify",
                format!(
                    "{} did not match what was decrypted; the .gpg files stay",
                    plain.display()
                ),
            ));
        }
    }
    for (name, _) in &decrypted {
        scrub_and_remove(&dir.join(gpg_name(name)))?;
    }
    log::info!("encryption disabled for {} files", decrypted.len());
    Ok(())
}

/// Task 10.3: try a passphrase against the library on disk. A wrong one
/// returns `wrong_passphrase` and stores nothing (the caller only stores the
/// passphrase after this succeeds).
pub fn unlock(crypto: &LibraryCrypto) -> Result<LoadReport, AppError> {
    storage::load_all(crypto)
}

/// Task 10.3 / acceptance "Start empty renames the file aside": set every
/// unreadable encrypted file aside with its bytes, then load what is left.
pub fn start_empty(crypto: &LibraryCrypto) -> Result<LoadReport, AppError> {
    let settings = storage::load_settings();
    let mut warnings = vec![];
    let dir = storage::data_dir_for(&settings.hosts_folder, &paths::config_dir(), &mut warnings);
    for w in warnings {
        log::warn!("start_empty: {w}");
    }
    for name in LIBRARY_FILES {
        let enc = dir.join(gpg_name(name));
        if enc.exists() {
            storage::rename_aside(&enc, &mut vec![]);
        }
    }
    storage::load_all(&LibraryCrypto::new(crypto.runner.clone()))
}

mod scrub;
#[cfg(test)]
mod tests;
