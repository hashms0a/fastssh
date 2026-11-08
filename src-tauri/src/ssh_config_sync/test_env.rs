//! Shared temp-dir harness for the sync tests: both sandbox variables point at
//! throwaway dirs, so the owner's ~/.ssh and ~/.config/fastssh are never
//! involved (rule 10).

use crate::models::Host;
use crate::paths;
use crate::settings::AppSettings;
use crate::ssh_config::IMPORT_GROUP;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use tempfile::TempDir;

pub(crate) struct Env {
    pub(crate) config: TempDir,
    pub(crate) ssh: TempDir,
    _lock: std::sync::MutexGuard<'static, ()>,
}

impl Env {
    pub(crate) fn new() -> Self {
        let config = tempfile::tempdir().unwrap();
        let ssh = tempfile::tempdir().unwrap();
        // A panicking test must not cascade into every later one.
        let _lock = paths::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: ENV_LOCK serializes every test that touches the environment.
        unsafe {
            std::env::set_var("FASTSSH_CONFIG_DIR", config.path());
            std::env::set_var("FASTSSH_SSH_DIR", ssh.path());
        }
        Env { config, ssh, _lock }
    }

    pub(crate) fn settings(&self) -> AppSettings {
        AppSettings {
            sync_ssh_config: true,
            ..AppSettings::default()
        }
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        // A read-only ssh dir would survive TempDir's cleanup, so restore it.
        let _ = fs::set_permissions(self.ssh.path(), fs::Permissions::from_mode(0o700));
        // SAFETY: paired with the set_var above, still under ENV_LOCK.
        unsafe {
            std::env::remove_var("FASTSSH_CONFIG_DIR");
            std::env::remove_var("FASTSSH_SSH_DIR");
        }
    }
}

pub(crate) fn host(name: &str, port: u16) -> Host {
    Host {
        id: format!("id-{name}"),
        name: name.to_string(),
        group: IMPORT_GROUP.to_string(),
        host: "10.0.0.7".to_string(),
        port,
        username: "ops".to_string(),
        password: "hunter2".to_string(),
        identity_file: String::new(),
        account: String::new(),
        color: String::new(),
        font: String::new(),
        tunnels: String::new(),
        extra_arguments: String::new(),
        ssh_config: String::new(),
        local: None,
    }
}

pub(crate) fn mode_of(path: &Path) -> u32 {
    fs::metadata(path).unwrap().permissions().mode() & 0o777
}
