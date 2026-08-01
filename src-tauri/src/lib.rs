mod commands;
mod models;
mod proxy;
mod state;
mod storage;
#[cfg(desktop)]
mod tray;
mod windows;

use tauri::Manager;
#[cfg(desktop)]
use tauri::WindowEvent;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Info
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .setup(|app| {
            let state = AppState::load(app.handle().clone())?;
            #[cfg(desktop)]
            tray::create_tray(app.handle(), &state.config.blocking_read())?;
            app.manage(state.clone());
            #[cfg(desktop)]
            {
                let restore = state.config.blocking_read().open_windows.clone();
                if !restore.is_empty() {
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.hide();
                    }
                    let snapshot = {
                        let mut config = state.config.blocking_write();
                        config.open_windows.clear();
                        config.clone()
                    };
                    state.storage.save_config(&snapshot)?;
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let mut restored = 0usize;
                        for item in restore {
                            if proxy::open_frontend_window(
                                &app_handle,
                                &state,
                                serde_json::json!({
                                    "instanceId": item.instance_id,
                                    "flavor": item.flavor,
                                    "bounds": item.bounds,
                                    "maximized": item.maximized
                                }),
                            )
                            .await
                            .is_ok()
                            {
                                restored += 1;
                            }
                        }
                        if restored == 0 {
                            let _ = windows::show_settings(&app_handle);
                        }
                    });
                }
            }
            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(desktop)]
            if _window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = _event {
                    api.prevent_close();
                    let _ = _window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_instance,
            commands::delete_instance,
            commands::set_active_instance,
            commands::set_flavor,
            commands::set_language,
            commands::refresh_status,
            commands::validate_access_token,
            commands::open_external,
            commands::open_window,
            commands::open_tool_window,
            commands::replace_frontend_storage,
            commands::get_key_query_profiles,
            commands::save_key_query_profile,
            commands::delete_key_query_profile,
            commands::query_token,
            commands::get_key_batch_profiles,
            commands::save_key_batch_profile,
            commands::delete_key_batch_profile,
            commands::connect_key_batch_database,
            commands::get_key_batch_groups,
            commands::count_key_batch_group,
            commands::execute_key_batch_operation,
            commands::query_key_batch_stats,
            commands::export_csv,
            commands::export_configuration,
            commands::import_configuration,
            commands::check_for_updates,
            commands::reload_window,
            commands::toggle_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
