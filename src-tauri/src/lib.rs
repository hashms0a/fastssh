pub mod env_sanitize;
pub mod paths;

pub mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            log::info!(
                "config_dir={:?} ssh_dir={:?} legacy_dir={:?}",
                paths::config_dir(),
                paths::ssh_dir(),
                paths::legacy_dir()
            );
            // Safety net: if the frontend never calls show() (JS crash),
            // reveal the window after 5 s anyway.
            if let Some(win) = app.get_webview_window("main") {
                let w2 = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = w2.show();
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::system::get_runtime_info])
        .run(tauri::generate_context!())
        .expect("error while building FastSSH");
}
