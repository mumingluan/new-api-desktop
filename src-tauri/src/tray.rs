#![cfg(desktop)]

use std::sync::atomic::Ordering;
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::{models::DesktopConfig, state::AppState};

fn build_menu(
    app: &AppHandle,
    config: &DesktopConfig,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut default = SubmenuBuilder::new(app, "Launch Default Frontend");
    let mut classic = SubmenuBuilder::new(app, "Launch Classic Frontend");
    for instance in &config.instances {
        default = default.text(format!("default:{}", instance.id), &instance.name);
        classic = classic.text(format!("classic:{}", instance.id), &instance.name);
    }
    let default = default.build()?;
    let classic = classic.build()?;
    MenuBuilder::new(app)
        .text("settings", "Settings")
        .separator()
        .item(&default)
        .item(&classic)
        .text("key-query", "Key Query")
        .text("key-batch", "Key Batch Operations")
        .separator()
        .text("quit", "Quit")
        .build()
}

pub fn refresh_tray(app: &AppHandle, config: &DesktopConfig) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(build_menu(app, config)?))?;
    }
    Ok(())
}

pub fn create_tray(app: &AppHandle, config: &DesktopConfig) -> tauri::Result<()> {
    let menu = build_menu(app, config)?;
    let icon = app.default_window_icon().cloned();
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("New API Desktop")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "settings" => {
                    let _ = crate::windows::show_settings(app);
                }
                "key-query" | "key-batch" => {
                    let _ = crate::windows::open_tool_window(app, id);
                }
                "quit" => {
                    if let Some(state) = app.try_state::<std::sync::Arc<AppState>>() {
                        state.is_exiting.store(true, Ordering::SeqCst);
                    }
                    app.exit(0);
                }
                _ => {
                    let Some((flavor, instance_id)) = id.split_once(':') else {
                        return;
                    };
                    if !matches!(flavor, "default" | "classic") {
                        return;
                    }
                    let app = app.clone();
                    let flavor = flavor.to_string();
                    let instance_id = instance_id.to_string();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<std::sync::Arc<AppState>>();
                        let _ = crate::proxy::open_frontend_window(
                            &app,
                            &state,
                            serde_json::json!({
                                "instanceId": instance_id,
                                "flavor": flavor
                            }),
                        )
                        .await;
                    });
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { .. }) {
                let _ = crate::windows::show_settings(&tray.app_handle());
            }
        });
    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}
