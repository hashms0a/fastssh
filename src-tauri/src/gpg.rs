//! Task 10.1: symmetric GPG through the host `gpg` binary (R6).
//!
//! The passphrase travels on gpg's stdin only (`--passphrase-fd 0`): never in
//! argv, never in the environment, because both are readable from `/proc`.
//! `--no-symkey-cache` stops gpg-agent from caching the passphrase, so a wrong
//! one really fails, and `--pinentry-mode loopback` is what gpg 2.1+ needs for
//! a non-interactive passphrase. Every child gets the sanitized host
//! environment (R20); `gnupg_home` is added after that, so tests can point gpg
//! at a throwaway dir.

use crate::env_sanitize::sanitize_std_command;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// The flags the plan fixes; `--passphrase-fd 0` reads the first stdin line.
pub const BASE_ARGS: &[&str] = &[
    "--batch",
    "--yes",
    "--quiet",
    "--pinentry-mode",
    "loopback",
    "--no-symkey-cache",
    "--passphrase-fd",
    "0",
];

/// What one gpg run does. `Decrypt` reads a file whose path is an argument.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Encrypt,
    Decrypt,
}

#[derive(Debug, PartialEq, Eq)]
pub enum GpgError {
    NotInstalled,
    WrongPassphrase,
    /// A passphrase with a newline would desync the stdin protocol (the first
    /// line is the passphrase, the rest is data), so it is rejected up front.
    BadPassphraseChars,
    Failed(String),
}

impl GpgError {
    pub fn message(&self) -> String {
        match self {
            GpgError::NotInstalled => {
                "gpg is not installed. Install gnupg to enable encryption.".into()
            }
            GpgError::WrongPassphrase => "Wrong passphrase.".into(),
            GpgError::BadPassphraseChars => "The passphrase must not contain a newline.".into(),
            GpgError::Failed(m) => m.clone(),
        }
    }
}

pub struct GpgRunner {
    program: PathBuf,
    gnupg_home: Option<PathBuf>,
}

impl GpgRunner {
    pub fn system() -> Self {
        Self {
            program: PathBuf::from("gpg"),
            gnupg_home: None,
        }
    }

    /// Tests point gpg at a temp `GNUPGHOME` so nothing touches `~/.gnupg`.
    pub fn with_gnupg_home(home: impl Into<PathBuf>) -> Self {
        Self {
            program: PathBuf::from("gpg"),
            gnupg_home: Some(home.into()),
        }
    }

    /// A test double: the same protocol against a script, so the callers can be
    /// tested on a failure a real gpg cannot produce on demand.
    #[doc(hidden)]
    pub fn with_program(program: impl Into<PathBuf>, gnupg_home: Option<PathBuf>) -> Self {
        Self {
            program: program.into(),
            gnupg_home,
        }
    }

    /// `gpg --version`; false when the binary is missing.
    pub fn is_available(&self) -> bool {
        let mut c = self.base();
        c.args(["--version"]);
        c.stdin(Stdio::null());
        c.stdout(Stdio::null());
        c.stderr(Stdio::null());
        c.spawn()
            .and_then(|mut child| child.wait())
            .map(|status| status.success())
            .unwrap_or(false)
    }

    fn base(&self) -> Command {
        let mut c = Command::new(&self.program);
        sanitize_std_command(&mut c);
        if let Some(home) = &self.gnupg_home {
            c.env("GNUPGHOME", home);
        }
        c.args(BASE_ARGS)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        c
    }

    /// The Command to spawn plus the bytes for its stdin. The passphrase is in
    /// the stdin payload only - `prepare` never puts it in argv or the
    /// environment, which the unit test checks with `get_args()`/`get_envs()`.
    pub fn prepare(
        &self,
        mode: Mode,
        path: Option<&Path>,
        pass: &str,
        data: &[u8],
    ) -> Result<(Command, Vec<u8>), GpgError> {
        if pass.is_empty() || pass.contains(['\n', '\r']) {
            return Err(GpgError::BadPassphraseChars);
        }
        let mut c = self.base();
        let mut input = Vec::with_capacity(pass.len() + 1 + data.len());
        input.extend_from_slice(pass.as_bytes());
        input.push(b'\n');
        match mode {
            Mode::Encrypt => {
                c.args([
                    "--symmetric",
                    "--armor",
                    "--cipher-algo",
                    "AES256",
                    "--output",
                    "-",
                ]);
                input.extend_from_slice(data);
            }
            Mode::Decrypt => {
                c.args(["--decrypt"]);
                if let Some(p) = path {
                    c.arg(p);
                }
            }
        }
        Ok((c, input))
    }

    /// Armored (`-----BEGIN PGP MESSAGE-----`) ciphertext for `plain`.
    pub fn encrypt(&self, plain: &[u8], pass: &str) -> Result<Vec<u8>, GpgError> {
        let (cmd, input) = self.prepare(Mode::Encrypt, None, pass, plain)?;
        self.run(cmd, input, Mode::Encrypt)
    }

    pub fn decrypt(&self, path: &Path, pass: &str) -> Result<Vec<u8>, GpgError> {
        let (cmd, input) = self.prepare(Mode::Decrypt, Some(path), pass, &[])?;
        self.run(cmd, input, Mode::Decrypt)
    }

    fn run(&self, mut cmd: Command, input: Vec<u8>, mode: Mode) -> Result<Vec<u8>, GpgError> {
        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GpgError::NotInstalled
            } else {
                GpgError::Failed(format!("gpg: {e}"))
            }
        })?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| GpgError::Failed("gpg stdin is not piped".into()))?;
        // Writing the whole input before reading stdout deadlocks as soon as
        // the 64 KiB pipe buffer fills, so the payload goes on its own thread
        // (the 5 MB round trip is the regression test for this).
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
            // Dropping `stdin` here closes the pipe, which ends gpg's read.
        });
        let out = child
            .wait_with_output()
            .map_err(|e| GpgError::Failed(format!("gpg: {e}")))?;
        let _ = writer.join();
        if out.status.success() {
            return Ok(out.stdout);
        }
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        if mode == Mode::Decrypt && is_wrong_passphrase(out.status.code(), &stderr) {
            return Err(GpgError::WrongPassphrase);
        }
        Err(GpgError::Failed(clean_stderr(&stderr)))
    }
}

/// gpg reports a bad symmetric passphrase as exit status 2 plus one of these
/// phrases; anything else is a real failure (a corrupt file, a missing binary).
fn is_wrong_passphrase(code: Option<i32>, stderr: &str) -> bool {
    code == Some(2) && (stderr.contains("Bad session key") || stderr.contains("decryption failed"))
}

/// One readable line for the UI, with the gpg prefixes kept.
fn clean_stderr(stderr: &str) -> String {
    let one = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if one.len() > 240 {
        let mut cut = 240;
        while cut > 0 && !one.is_char_boundary(cut) {
            cut -= 1;
        }
        one[..cut].to_string()
    } else {
        one
    }
}

#[cfg(test)]
mod tests;
