// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 1. Capture the clean host environment before any mutations.
    fastssh_lib::env_sanitize::init_clean_environment();

    // 2. Prevent WebKitGTK blank windows (seen most with NVIDIA + Wayland).
    //    Done AFTER the clean environment is captured, so child processes
    //    do not inherit it.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: no other thread exists yet, so mutating the environment
        // here cannot race with readers.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    fastssh_lib::run();
}
