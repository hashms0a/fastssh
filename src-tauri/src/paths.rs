use std::path::PathBuf;

/// Justified panic (plan 12.1): a GUI session always has HOME - systemd,
/// GDM and every display manager set it before starting the app, and Tauri's
/// own builder already needs a readable home for the log plugin. A process
/// without HOME cannot run FastSSH at all, so mapping this to AppError would
/// only move the failure into a modal that says "HOME is not set".
fn home() -> PathBuf {
    dirs::home_dir().expect("HOME must be set")
}

fn override_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// ~/.config/fastssh (honours XDG_CONFIG_HOME) unless FASTSSH_CONFIG_DIR is set.
pub fn config_dir() -> PathBuf {
    override_dir("FASTSSH_CONFIG_DIR").unwrap_or_else(|| {
        dirs::config_dir()
            .unwrap_or_else(|| home().join(".config"))
            .join("fastssh")
    })
}

pub fn ssh_dir() -> PathBuf {
    override_dir("FASTSSH_SSH_DIR").unwrap_or_else(|| home().join(".ssh"))
}

pub fn legacy_dir() -> PathBuf {
    override_dir("FASTSSH_LEGACY_DIR").unwrap_or_else(|| home().join(".config").join("easyssh"))
}

/// True when testing against a sandbox ssh dir: ssh must get -F and UserKnownHostsFile.
pub fn ssh_dir_overridden() -> bool {
    override_dir("FASTSSH_SSH_DIR").is_some()
}

/// Expands a leading "~/" (settings store "~/.config/fastssh").
pub fn expand_tilde(p: &str) -> PathBuf {
    match p.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None if p == "~" => home(),
        None => PathBuf::from(p),
    }
}

#[cfg(test)]
/// Serializes the tests that mutate the process environment.
pub static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overrides_win_when_vars_set() {
        let _g = ENV_LOCK.lock().unwrap();
        // SAFETY: the tests touching the process environment are serialized by ENV_LOCK.
        unsafe {
            std::env::set_var("FASTSSH_CONFIG_DIR", "/tmp/fsx/config");
            std::env::set_var("FASTSSH_SSH_DIR", "/tmp/fsx/ssh");
            std::env::set_var("FASTSSH_LEGACY_DIR", "/tmp/fsx/legacy");
        }
        assert_eq!(config_dir(), PathBuf::from("/tmp/fsx/config"));
        assert_eq!(ssh_dir(), PathBuf::from("/tmp/fsx/ssh"));
        assert_eq!(legacy_dir(), PathBuf::from("/tmp/fsx/legacy"));
        assert!(ssh_dir_overridden());
        unsafe {
            std::env::remove_var("FASTSSH_CONFIG_DIR");
            std::env::remove_var("FASTSSH_SSH_DIR");
            std::env::remove_var("FASTSSH_LEGACY_DIR");
        }
    }

    #[test]
    fn defaults_when_vars_unset() {
        let _g = ENV_LOCK.lock().unwrap();
        unsafe {
            std::env::remove_var("FASTSSH_CONFIG_DIR");
            std::env::remove_var("FASTSSH_SSH_DIR");
            std::env::remove_var("FASTSSH_LEGACY_DIR");
        }
        assert!(config_dir().ends_with("fastssh"));
        assert_eq!(ssh_dir(), home().join(".ssh"));
        assert_eq!(legacy_dir(), home().join(".config").join("easyssh"));
        assert!(!ssh_dir_overridden());
    }

    #[test]
    fn expands_tilde() {
        assert_eq!(
            expand_tilde("~/.config/fastssh"),
            home().join(".config/fastssh")
        );
        assert_eq!(expand_tilde("~"), home());
        assert_eq!(expand_tilde("/abs/path"), PathBuf::from("/abs/path"));
        assert_eq!(expand_tilde("relative/x"), PathBuf::from("relative/x"));
    }
}
