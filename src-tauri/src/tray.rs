#![cfg(desktop)]

use std::sync::atomic::Ordering;
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::{
    models::{resolve_language, DesktopConfig},
    state::AppState,
};

struct TrayLabels {
    settings: &'static str,
    launch_default: &'static str,
    launch_classic: &'static str,
    key_query: &'static str,
    key_batch: &'static str,
    quit: &'static str,
}

fn labels(language: &str) -> TrayLabels {
    match language {
        "zh" => TrayLabels {
            settings: "设置",
            launch_default: "启动新版前端",
            launch_classic: "启动经典前端",
            key_query: "密钥查询",
            key_batch: "密钥批量操作",
            quit: "退出",
        },
        "fr" => TrayLabels {
            settings: "Paramètres",
            launch_default: "Lancer la nouvelle interface",
            launch_classic: "Lancer l’interface classique",
            key_query: "Requête de clé",
            key_batch: "Opérations groupées sur les clés",
            quit: "Quitter",
        },
        "ja" => TrayLabels {
            settings: "設定",
            launch_default: "新版フロントエンドを起動",
            launch_classic: "クラシック版フロントエンドを起動",
            key_query: "キー照会",
            key_batch: "キー一括操作",
            quit: "終了",
        },
        "ru" => TrayLabels {
            settings: "Настройки",
            launch_default: "Запустить новый интерфейс",
            launch_classic: "Запустить классический интерфейс",
            key_query: "Проверка ключа",
            key_batch: "Пакетные операции с ключами",
            quit: "Выход",
        },
        "vi" => TrayLabels {
            settings: "Cài đặt",
            launch_default: "Mở giao diện mới",
            launch_classic: "Mở giao diện cổ điển",
            key_query: "Tra cứu khóa",
            key_batch: "Thao tác khóa hàng loạt",
            quit: "Thoát",
        },
        _ => TrayLabels {
            settings: "Settings",
            launch_default: "Launch Default Frontend",
            launch_classic: "Launch Classic Frontend",
            key_query: "Key Query",
            key_batch: "Key Batch Operations",
            quit: "Quit",
        },
    }
}

fn opens_settings(button: MouseButton, state: MouseButtonState) -> bool {
    button == MouseButton::Left && state == MouseButtonState::Up
}

fn build_menu(
    app: &AppHandle,
    config: &DesktopConfig,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let language = resolve_language(&config.desktop_language);
    let labels = labels(&language);
    let mut default = SubmenuBuilder::new(app, labels.launch_default);
    let mut classic = SubmenuBuilder::new(app, labels.launch_classic);
    for instance in &config.instances {
        default = default.text(format!("default:{}", instance.id), &instance.name);
        classic = classic.text(format!("classic:{}", instance.id), &instance.name);
    }
    let default = default.build()?;
    let classic = classic.build()?;
    MenuBuilder::new(app)
        .text("settings", labels.settings)
        .separator()
        .item(&default)
        .item(&classic)
        .text("key-query", labels.key_query)
        .text("key-batch", labels.key_batch)
        .separator()
        .text("quit", labels.quit)
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
            if matches!(
                event,
                TrayIconEvent::Click {
                    button,
                    button_state,
                    ..
                } if opens_settings(button, button_state)
            ) {
                let _ = crate::windows::show_settings(&tray.app_handle());
            }
        });
    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_left_button_release_opens_settings() {
        assert!(opens_settings(MouseButton::Left, MouseButtonState::Up));
        assert!(!opens_settings(MouseButton::Left, MouseButtonState::Down));
        assert!(!opens_settings(MouseButton::Right, MouseButtonState::Down));
        assert!(!opens_settings(MouseButton::Right, MouseButtonState::Up));
    }

    #[test]
    fn localizes_tray_labels_for_every_supported_language() {
        assert_eq!(labels("zh").settings, "设置");
        assert_eq!(labels("fr").quit, "Quitter");
        assert_eq!(labels("ja").key_query, "キー照会");
        assert_eq!(labels("ru").settings, "Настройки");
        assert_eq!(labels("vi").quit, "Thoát");
        assert_eq!(labels("en").settings, "Settings");
    }
}
