pub mod commands;
pub mod env_sanitize;
pub mod error;
pub mod models;
pub mod paths;
pub mod settings;
pub mod storage;

use std::sync::Mutex;
use tauri::Manager;

/// Shared state: current settings (Stage 1) and the GPG passphrase
/// (Stage 10; unused until then).
pub struct AppState {
    pub settings: Mutex<settings::AppSettings>,
    pub passphrase: Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Read synchronously before the window exists so the first frame has
    // the saved size (R19a).
    let initial = storage::load_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            settings: Mutex::new(initial.clone()),
            passphrase: Mutex::new(None),
        })
        .setup(move |app| {
            log::info!(
                "config_dir={:?} ssh_dir={:?} legacy_dir={:?}",
                paths::config_dir(),
                paths::ssh_dir(),
                paths::legacy_dir()
            );
            // Safety net: if the frontend never calls show() (JS crash),
            // reveal the window after 5 s anyway.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_size(tauri::LogicalSize::new(
                    initial.window_width as f64,
                    initial.window_height as f64,
                ));
                if initial.window_maximized {
                    let _ = win.maximize();
                }
                let w2 = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = w2.show();
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_runtime_info,
            commands::library::load_all,
            commands::library::save_hosts,
            commands::library::save_accounts,
            commands::library::save_bookmarks,
            commands::library::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while building FastSSH");
}
