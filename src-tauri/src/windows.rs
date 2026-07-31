#[cfg(desktop)]
use tauri::{webview::WebviewWindowBuilder, WebviewUrl};
use tauri::{AppHandle, Manager};
use url::Url;

fn internal_url(path: &str) -> Result<Url, url::ParseError> {
    #[cfg(any(target_os = "windows", target_os = "android"))]
    let root = "http://tauri.localhost/";
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    let root = "tauri://localhost/";
    Url::parse(root)?.join(path)
}

pub fn show_settings(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    if cfg!(mobile) {
        window.navigate(
            internal_url("").map_err(|error| tauri::Error::AssetNotFound(error.to_string()))?,
        )?;
    }
    window.show()?;
    window.set_focus()?;
    Ok(())
}

pub fn open_tool_window(app: &AppHandle, tool: &str) -> tauri::Result<()> {
    #[cfg_attr(mobile, allow(unused_variables))]
    let (label, path, title, height) = match tool {
        "settings" => return show_settings(app),
        "key-query" => (
            "key-query",
            "key-query/index.html",
            "New API Desktop - 密钥查询",
            820.0,
        ),
        "key-batch" => (
            "key-batch",
            "key-batch/index.html",
            "New API Desktop - 密钥批量操作",
            880.0,
        ),
        _ => return Ok(()),
    };
    if cfg!(mobile) {
        if let Some(window) = app.get_webview_window("main") {
            window.navigate(
                internal_url(path)
                    .map_err(|error| tauri::Error::AssetNotFound(error.to_string()))?,
            )?;
        }
        return Ok(());
    }
    #[cfg(desktop)]
    {
        if let Some(window) = app.get_webview_window(label) {
            window.show()?;
            window.set_focus()?;
            return Ok(());
        }
        WebviewWindowBuilder::new(app, label, WebviewUrl::App(path.into()))
            .title(title)
            .inner_size(1320.0, height)
            .min_inner_size(800.0, 600.0)
            .build()?;
    }
    Ok(())
}
