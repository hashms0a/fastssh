pub mod commands;
pub mod env_sanitize;
pub mod error;
pub mod file_browser;
pub mod hosts_folder;
pub mod models;
pub mod paths;
pub mod pty_manager;
pub mod settings;
pub mod ssh_command;
pub mod ssh_config;
pub mod ssh_config_sync;
pub mod storage;
pub mod utf8_chunker;

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
        .manage(pty_manager::PtyManager::default())
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
            commands::system::quit_app,
            commands::system::open_sftp_file_browser,
            commands::system::open_url,
            commands::library::load_all,
            commands::library::save_hosts,
            commands::library::save_accounts,
            commands::library::save_bookmarks,
            commands::library::save_settings,
            commands::library::folder_has_library,
            commands::library::set_hosts_folder,
            commands::session::spawn_session,
            commands::session::write_pty,
            commands::session::resize_pty,
            commands::session::kill_session,
            commands::sync::ssh_config_info,
            commands::sync::enable_ssh_config_sync,
            commands::sync::disable_ssh_config_sync,
        ])
        .build(tauri::generate_context!())
        .expect("error while building FastSSH")
        .run(|app_handle, event| {
            // R20/plan Stage 4: every PTY child dies with the app, so no
            // ssh or shell process is orphaned after a quit.
            if let tauri::RunEvent::Exit = event {
                app_handle.state::<pty_manager::PtyManager>().kill_all();
            }
        });
}
