//! R16 / R12: open a remote host in the desktop's file manager, and an
//! http(s) link in the default browser (tasks 7.2, 7.3).
//!
//! Two rules keep this module testable and safe:
//!   * every child process goes through `sanitize_std_command` (R20), so an
//!     AppImage's APPDIR/LD_* variables never leak into nautilus or dolphin;
//!   * the launch order is data (`launch_plan`), and `launch_with` takes a
//!     runner closure, so a unit test can prove the fallback chain without
//!     starting a single real program.

use crate::env_sanitize::sanitize_std_command;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// How long `xdg-open` may run before we call it a success (a launcher that
/// hands the URL to a running file manager usually exits within a second).
pub const LAUNCH_TIMEOUT: Duration = Duration::from_secs(10);

/// RFC 3986 unreserved characters; everything else is percent-encoded, so a
/// user name with spaces or an `@` cannot forge the URL's authority.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// An IPv6 address needs brackets in a URL; a zone id (`fe80::1%eth0`) keeps
/// its `%` percent-encoded inside them.
fn host_authority(host: &str) -> String {
    if host.starts_with('[') {
        return host.to_string();
    }
    if host.contains(':') {
        return format!("[{}]", host.replace('%', "%25"));
    }
    host.to_string()
}

/// `sftp://user@host:port/` with the user encoded and the IPv6 host bracketed.
/// An empty user produces no `user@` at all (GVFS/KIO then ask for it).
pub fn sftp_url(user: &str, host: &str, port: u16) -> String {
    let authority = host_authority(host);
    if user.is_empty() {
        format!("sftp://{authority}:{port}/")
    } else {
        format!("sftp://{}@{authority}:{port}/", percent_encode(user))
    }
}

/// Only web links are opened from the terminal; `file:`, `javascript:` and
/// `ssh:` are refused (task 7.3).
pub fn is_web_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

/// One launcher attempt. `wait` polls for the exit code; `None` spawns the
/// program and reaps it in a background thread (dolphin stays open).
pub struct Launch {
    pub program: &'static str,
    pub args: Vec<String>,
    pub wait: Option<Duration>,
}

/// The order for a desktop: xdg-open everywhere, then kioclient and dolphin
/// on KDE only (R16).
pub fn launch_plan(url: &str, desktop: &str) -> Vec<(&'static str, Launch)> {
    let mut plan: Vec<(&'static str, Launch)> = vec![(
        "xdg-open",
        Launch {
            program: "xdg-open",
            args: vec![url.to_string()],
            wait: Some(LAUNCH_TIMEOUT),
        },
    )];
    if desktop.to_uppercase().contains("KDE") {
        plan.push((
            "kioclient",
            Launch {
                program: "kioclient",
                args: vec!["exec".to_string(), url.to_string()],
                wait: Some(LAUNCH_TIMEOUT),
            },
        ));
        plan.push((
            "dolphin",
            Launch {
                program: "dolphin",
                args: vec![url.to_string()],
                wait: None,
            },
        ));
    }
    plan
}

/// Try the plan in order with an injected runner. Returns the name of the
/// launcher that worked; the error names the URL so the UI can offer to copy
/// it (Section 2: "Could not open a file browser. Copy this address: ...").
pub fn launch_with(
    url: &str,
    desktop: &str,
    run: &mut dyn FnMut(&Launch) -> bool,
) -> Result<&'static str, String> {
    for (_, spec) in launch_plan(url, desktop) {
        if run(&spec) {
            return Ok(spec.program);
        }
    }
    Err(format!(
        "Could not open a file browser. Copy this address: {url}"
    ))
}

/// Run one launcher for real: sanitized environment, no stdio, and a thread
/// that reaps a detached child so it is never a zombie.
fn exec(spec: &Launch) -> bool {
    let mut cmd = Command::new(spec.program);
    sanitize_std_command(&mut cmd);
    cmd.args(&spec.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let Ok(mut child) = cmd.spawn() else {
        return false;
    };
    let Some(timeout) = spec.wait else {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        return true;
    };
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            // Still running when the deadline passed: the URL was handed over.
            _ => {
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                return true;
            }
        }
    }
}

/// R16: the file-manager chain. `desktop` is the raw XDG_CURRENT_DESKTOP
/// value (a colon list such as "ubuntu:GNOME" or "KDE").
pub fn open_sftp(url: &str, desktop: &str) -> Result<&'static str, String> {
    let mut attempts: Vec<(&'static str, bool)> = Vec::new();
    let result = launch_with(url, desktop, &mut |spec| {
        let ok = exec(spec);
        attempts.push((spec.program, ok));
        ok
    });
    for (program, ok) in &attempts {
        log::info!("open_sftp program={program} ok={ok} url={url}");
    }
    match &result {
        Ok(method) => log::info!("open_sftp method={method} url={url}"),
        Err(_) => log::warn!("open_sftp no launcher accepted url={url}"),
    }
    result
}

/// R12: a terminal link goes to the default browser through xdg-open.
pub fn open_web_url(url: &str) -> Result<&'static str, String> {
    if !is_web_url(url) {
        return Err(format!(
            "Refusing to open {url}: FastSSH opens only http:// and https:// links."
        ));
    }
    if exec(&Launch {
        program: "xdg-open",
        args: vec![url.to_string()],
        wait: Some(LAUNCH_TIMEOUT),
    }) {
        log::info!("open_url method=xdg-open url={url}");
        Ok("xdg-open")
    } else {
        log::warn!("open_url xdg-open refused url={url}");
        Err(format!("Could not open a browser for {url}"))
    }
}

#[cfg(test)]
mod tests;
