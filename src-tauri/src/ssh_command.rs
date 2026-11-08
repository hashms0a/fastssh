//! Builds the ssh command line (R9, task 5.1).
//!
//! The PTY runs `/bin/sh`, and `PtyManager` writes ` exec <line>\n` into it,
//! so every value we generate is quoted for /bin/sh. `extra_arguments` are
//! appended VERBATIM: EasySSH does the same, and the user types shell syntax
//! (the editor tooltip says so).
//!
//! The password is NOT part of the line. It is typed into the PTY by the
//! frontend prompt watcher (R11), so it never appears in `ps`.

use crate::models::Host;
use crate::paths::expand_tilde;
use std::path::Path;

/// Credentials resolved by the frontend (task 5.2). Rust trusts that copy
/// and re-validates the port and the host name. The password is deliberately
/// absent: nothing here needs it, and keeping it out of this module keeps it
/// out of the command line and out of the logs.
pub struct Creds<'a> {
    pub username: &'a str,
    pub identity_file: &'a str,
}

/// Shell-safe characters (plan 5.1). A value made only of these is left bare,
/// which keeps ordinary `user@host` targets readable in `ps`.
fn is_safe_byte(b: u8) -> bool {
    matches!(
        b,
        b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'@'
            | b'%'
            | b'_'
            | b'+'
            | b'='
            | b':'
            | b','
            | b'.'
            | b'/'
            | b'-'
    )
}

/// Wrap in single quotes and escape `'` as `'\''`.
pub fn shell_quote(s: &str) -> String {
    if !s.is_empty() && s.bytes().all(is_safe_byte) {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

/// One tunnel entry: the ssh flag letter and the `src:dest:dport` spec.
fn valid_spec(spec: &str) -> bool {
    let Some(first) = spec.find(':') else {
        return false;
    };
    let Some(last) = spec.rfind(':') else {
        return false;
    };
    if first == last {
        return false;
    }
    let src = &spec[..first];
    let dest = &spec[first + 1..last];
    let dport = &spec[last + 1..];
    let in_range = |v: &str| v.parse::<u16>().is_ok_and(|p| p > 0);
    in_range(src) && !dest.is_empty() && in_range(dport)
}

/// `"-L 18080:localhost:80,-R 9000:db:5432"` -> `[('L', …), ('R', …)]`.
/// The flag letter is optional (a bare `8080:db:22` is local, like the
/// frontend parser in `src/lib/tunnels.ts`). Unparsable entries are skipped
/// with a warning: the editor already rejects them, and a stray string must
/// not break the connection.
pub fn parse_tunnel_flags(text: &str) -> Vec<(char, String)> {
    let mut out = Vec::new();
    for part in text.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let mut it = part.chars();
        let (flag, rest) = match it.next() {
            Some('-') => match it.next().map(|c| c.to_ascii_lowercase()) {
                Some('l') => ('L', it.as_str()),
                Some('r') => ('R', it.as_str()),
                _ => {
                    log::warn!("Ignoring an unknown tunnel option: {part}");
                    continue;
                }
            },
            _ => ('L', part),
        };
        // "8080: localhost:80" is the same rule as "8080:localhost:80".
        let spec: String = rest.trim().chars().filter(|c| !c.is_whitespace()).collect();
        if !valid_spec(&spec) {
            log::warn!("Ignoring an invalid tunnel: {part}");
            continue;
        }
        out.push((flag, spec));
    }
    out
}

/// `sandbox` is the overridden ssh dir (FASTSSH_SSH_DIR): ssh then gets
/// `-F <dir>/config -o UserKnownHostsFile=<dir>/known_hosts` right after
/// "ssh", so a test can never touch the owner's real files (R20/paths.rs).
pub fn build_ssh_line(
    host: &Host,
    creds: &Creds,
    sync: bool,
    sandbox: Option<&Path>,
) -> Result<String, String> {
    if host.port == 0 {
        return Err(format!(
            "{}: the port must be between 1 and 65535",
            host.name
        ));
    }
    let mut parts: Vec<String> = vec!["ssh".to_string()];
    if let Some(dir) = sandbox {
        parts.extend([
            "-F".to_string(),
            shell_quote(&dir.join("config").display().to_string()),
            "-o".to_string(),
            shell_quote(&format!(
                "UserKnownHostsFile={}",
                dir.join("known_hosts").display()
            )),
        ]);
    }

    if sync {
        // Sync mode (R7): ssh reads its own config, so the name is enough.
        parts.push(shell_quote(host.name.trim()));
    } else {
        let addr = host.host.trim();
        if addr.is_empty() {
            return Err(format!("{}: the host is empty", host.name));
        }
        // An empty username means "use the local user", so no "user@".
        let target = if creds.username.is_empty() {
            addr.to_string()
        } else {
            format!("{}@{}", creds.username, addr)
        };
        parts.push(shell_quote(&target));
        parts.push("-p".to_string());
        parts.push(host.port.to_string());
        let identity = creds.identity_file.trim();
        if !identity.is_empty() {
            // Quoting stops the shell from expanding "~", so expand it here.
            parts.push("-i".to_string());
            parts.push(shell_quote(&expand_tilde(identity).display().to_string()));
        }
        for (flag, spec) in parse_tunnel_flags(&host.tunnels) {
            parts.push(format!("-{flag}"));
            parts.push(shell_quote(&spec));
        }
    }

    let extra = host.extra_arguments.trim();
    if !extra.is_empty() {
        parts.push(extra.to_string()); // verbatim, by design
    }
    Ok(parts.join(" "))
}

#[cfg(test)]
mod tests;
