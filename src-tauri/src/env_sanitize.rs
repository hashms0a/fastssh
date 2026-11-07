use portable_pty::CommandBuilder;
use std::collections::HashMap;
use std::process::Command;
use std::sync::OnceLock;

static CLEAN_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

const APPIMAGE_VARS: &[&str] = &[
    "APPIMAGE",
    "APPDIR",
    "OWD",
    "ARGV0",
    "APPIMAGE_UUID",
    "LD_PRELOAD",
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_PIXBUF_MODULEDIR",
    "GSETTINGS_SCHEMA_DIR",
    "GI_TYPELIB_PATH",
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "GTK_DATA_PREFIX",
    "GTK_IM_MODULE_FILE",
    "GIO_MODULE_DIR",
    "GIO_EXTRA_MODULES",
    "QT_PLUGIN_PATH",
    "PERLLIB",
    "PYTHONHOME",
    "PYTHONPATH",
];

/// Pure function so tests never touch the real process environment.
pub fn build_clean_env(
    vars: impl IntoIterator<Item = (String, String)>,
) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = vars.into_iter().collect();
    if env.contains_key("APPIMAGE") || env.contains_key("APPDIR") {
        let appdir = env.get("APPDIR").cloned().unwrap_or_default();
        for k in APPIMAGE_VARS {
            env.remove(*k);
        }
        match env.remove("ORIGINAL_LD_LIBRARY_PATH") {
            Some(orig) if !orig.is_empty() => {
                env.insert("LD_LIBRARY_PATH".into(), orig);
            }
            Some(_) => {
                env.remove("LD_LIBRARY_PATH");
            }
            None => strip_var(&mut env, "LD_LIBRARY_PATH", &appdir),
        }
        // Catch-all: any remaining var whose value points into the mount.
        let keys: Vec<String> = env.keys().cloned().collect();
        for k in keys {
            strip_var(&mut env, &k, &appdir);
        }
    }
    env.insert("TERM".into(), "xterm-256color".into());
    env.insert("COLORTERM".into(), "truecolor".into());
    env
}

fn is_appdir_path(seg: &str, appdir: &str) -> bool {
    (!appdir.is_empty() && seg.starts_with(appdir)) || seg.starts_with("/tmp/.mount_")
}

/// Only rewrites values that contain an AppDir path; others are untouched.
fn strip_var(env: &mut HashMap<String, String>, key: &str, appdir: &str) {
    let Some(val) = env.get(key).cloned() else {
        return;
    };
    if !val.split(':').any(|s| is_appdir_path(s, appdir)) {
        return;
    }
    let kept: Vec<&str> = val
        .split(':')
        .filter(|s| !s.is_empty() && !is_appdir_path(s, appdir))
        .collect();
    if kept.is_empty() {
        env.remove(key);
    } else {
        env.insert(key.to_string(), kept.join(":"));
    }
}

pub fn init_clean_environment() {
    let _ = clean_env();
}

pub fn clean_env() -> &'static HashMap<String, String> {
    CLEAN_ENV.get_or_init(|| build_clean_env(std::env::vars()))
}

pub fn sanitize_std_command(cmd: &mut Command) {
    cmd.env_clear();
    cmd.envs(clean_env());
}

pub fn sanitize_pty_command(cmd: &mut CommandBuilder) {
    cmd.env_clear();
    for (k, v) in clean_env() {
        cmd.env(k, v);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn v(p: &[(&str, &str)]) -> Vec<(String, String)> {
        p.iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect()
    }

    #[test]
    fn strips_appimage_entries() {
        let e = build_clean_env(v(&[
            ("APPDIR", "/tmp/.mount_FastSSabc"),
            ("APPIMAGE", "/x/F.AppImage"),
            ("PATH", "/tmp/.mount_FastSSabc/usr/bin:/usr/bin:/bin"),
            ("LD_LIBRARY_PATH", "/tmp/.mount_FastSSabc/usr/lib"),
            (
                "XDG_DATA_DIRS",
                "/tmp/.mount_FastSSabc/usr/share:/usr/share",
            ),
            ("HOME", "/home/u"),
        ]));
        assert!(!e.contains_key("APPDIR") && !e.contains_key("APPIMAGE"));
        assert!(!e.contains_key("LD_LIBRARY_PATH"));
        assert_eq!(e["PATH"], "/usr/bin:/bin");
        assert_eq!(e["XDG_DATA_DIRS"], "/usr/share");
        assert_eq!(e["HOME"], "/home/u");
        assert_eq!(e["TERM"], "xterm-256color");
    }

    #[test]
    fn restores_original_ld_library_path_when_non_empty() {
        let e = build_clean_env(v(&[
            ("APPDIR", "/tmp/.mount_FastSSabc"),
            ("ORIGINAL_LD_LIBRARY_PATH", "/opt/lib:/usr/lib"),
            ("LD_LIBRARY_PATH", "/tmp/.mount_FastSSabc/usr/lib"),
        ]));
        assert_eq!(e["LD_LIBRARY_PATH"], "/opt/lib:/usr/lib");
    }

    #[test]
    fn removes_ld_library_path_when_original_is_empty() {
        let e = build_clean_env(v(&[
            ("APPDIR", "/tmp/.mount_FastSSabc"),
            ("ORIGINAL_LD_LIBRARY_PATH", ""),
            ("LD_LIBRARY_PATH", "/tmp/.mount_FastSSabc/usr/lib"),
        ]));
        assert!(!e.contains_key("LD_LIBRARY_PATH"));
    }

    #[test]
    fn plain_environment_is_untouched_except_terminal_vars() {
        let e = build_clean_env(v(&[
            ("PATH", "/usr/bin:/bin"),
            ("HOME", "/home/u"),
            ("LANG", "en_US.UTF-8"),
        ]));
        assert_eq!(e["PATH"], "/usr/bin:/bin");
        assert_eq!(e["HOME"], "/home/u");
        assert_eq!(e["LANG"], "en_US.UTF-8");
        assert_eq!(e["TERM"], "xterm-256color");
        assert_eq!(e["COLORTERM"], "truecolor");
    }

    #[test]
    fn value_without_appdir_segment_keeps_exact_text() {
        let e = build_clean_env(v(&[
            ("APPDIR", "/tmp/.mount_FastSSabc"),
            ("MANPATH", "/usr/local/man:/usr/share/man"),
        ]));
        assert_eq!(e["MANPATH"], "/usr/local/man:/usr/share/man");
    }

    #[test]
    fn catch_all_strips_unknown_appdir_variables() {
        let e = build_clean_env(v(&[
            ("APPDIR", "/tmp/.mount_FastSSabc"),
            (
                "SOME_PLUGIN_PATH",
                "/tmp/.mount_FastSSabc/usr/plugins:/opt/plugins",
            ),
        ]));
        assert_eq!(e["SOME_PLUGIN_PATH"], "/opt/plugins");
    }
}
