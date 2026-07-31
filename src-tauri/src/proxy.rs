use std::sync::Arc;
#[cfg(desktop)]
use std::{sync::atomic::Ordering, time::Duration};

use axum::{
    body::{to_bytes, Body},
    extract::State as AxumState,
    http::{
        header::{self, HeaderValue},
        Request, Response, StatusCode,
    },
    routing::any,
    Router,
};
use futures_util::StreamExt;
use serde_json::Value;
#[cfg(desktop)]
use tauri::{webview::WebviewWindowBuilder, WebviewUrl, WindowEvent};
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use url::Url;
use uuid::Uuid;

#[cfg(desktop)]
use crate::models::{OpenWindowState, WindowBounds};
use crate::{models::Instance, state::AppState};

const PROXY_PREFIXES: &[&str] = &[
    "/457",
    "/api",
    "/mj",
    "/pg",
    "/v1",
    "/v1beta",
    "/dashboard",
    "/swagger",
];

struct ServerContext {
    state: Arc<AppState>,
    instance: Instance,
    flavor: String,
    asset_flavor: String,
    window_label: String,
}

fn error_response(status: StatusCode, message: impl Into<String>) -> Response<Body> {
    let body = serde_json::json!({ "success": false, "message": message.into() }).to_string();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body))
        .unwrap()
}

fn should_proxy(path: &str) -> bool {
    PROXY_PREFIXES
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

fn storage_flavor(flavor: &str) -> &str {
    if flavor == "xuancat" {
        "default"
    } else {
        flavor
    }
}

fn inline_json(value: &Value) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| "null".into())
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

async fn inject_bootstrap(html: String, context: &ServerContext) -> String {
    let config = context.state.config.read().await;
    let language = if config.desktop_language == "auto" {
        "en"
    } else {
        &config.desktop_language
    };
    let user =
        if context.instance.auth_mode == "accessToken" && !context.instance.user_id.is_empty() {
            context.instance.user.clone().or_else(|| {
                Some(serde_json::json!({
                    "id": context.instance.user_id.parse::<i64>().ok().map(Value::from)
                        .unwrap_or_else(|| Value::String(context.instance.user_id.clone())),
                    "username": context.instance.name,
                    "display_name": context.instance.name,
                    "role": 1,
                    "status": 1
                }))
            })
        } else {
            None
        };
    let storage = context.state.frontend_storage.read().await;
    let snapshot = storage
        .get("instances")
        .and_then(|value| value.get(&context.instance.id))
        .and_then(|value| value.get(storage_flavor(&context.flavor)))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let bootstrap = serde_json::json!({
        "desktop": true,
        "mobile": cfg!(mobile),
        "backend": {
            "id": context.instance.id,
            "baseUrl": context.instance.base_url,
            "authMode": context.instance.auth_mode
        },
        "flavor": context.asset_flavor,
        "language": language,
        "user": user
    });
    let mobile_button = if cfg!(mobile) {
        r#"
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '‹';
  back.setAttribute('aria-label', '返回桌面设置');
  Object.assign(back.style, {position:'fixed',left:'12px',top:'12px',zIndex:'2147483647',
    width:'42px',height:'42px',borderRadius:'21px',border:'1px solid rgba(127,127,127,.35)',
    background:'rgba(20,20,20,.78)',color:'#fff',fontSize:'30px',lineHeight:'34px'});
  back.addEventListener('click', () => fetch('/__desktop/back', {method:'POST'}));
  addEventListener('DOMContentLoaded', () => document.body.appendChild(back), {once:true});
"#
    } else {
        ""
    };
    let script = format!(
        r#"<script>
window.__NEW_API_DESKTOP__={bootstrap};
try {{
  const desktopStorage={snapshot};
  localStorage.clear();
  for (const [key,value] of Object.entries(desktopStorage)) {{
    if (typeof value === 'string') localStorage.setItem(key,value);
  }}
  localStorage.setItem('i18nextLng',{language});
  localStorage.setItem('language',{language});
  {user_script}
  const persistDesktopStorage=()=>{{
    const value={{}};
    for(let index=0;index<localStorage.length;index+=1){{
      const key=localStorage.key(index);
      if(key!==null)value[key]=localStorage.getItem(key);
    }}
    fetch('/__desktop/storage',{{method:'POST',headers:{{'content-type':'application/json'}},
      body:JSON.stringify(value),keepalive:true}}).catch(()=>{{}});
  }};
  let persistTimer;
  const schedulePersist=()=>{{clearTimeout(persistTimer);persistTimer=setTimeout(persistDesktopStorage,80);}};
  for(const method of ['setItem','removeItem','clear']){{
    const original=Storage.prototype[method];
    Storage.prototype[method]=function(...args){{
      const result=original.apply(this,args);
      if(this===localStorage)schedulePersist();
      return result;
    }};
  }}
  addEventListener('beforeunload',persistDesktopStorage);
  {mobile_button}
}} catch (_) {{}}
</script>"#,
        bootstrap = inline_json(&bootstrap),
        snapshot = inline_json(&snapshot),
        language = inline_json(&Value::String(language.to_string())),
        user_script = user
            .map(|value| format!(
                "localStorage.setItem('user',{});localStorage.setItem('uid',{});",
                inline_json(&Value::String(value.to_string())),
                inline_json(&Value::String(
                    value.get("id").map(ToString::to_string).unwrap_or_default()
                ))
            ))
            .unwrap_or_default(),
    );
    if let Some(index) = html.find("</head>") {
        format!("{}{}{}", &html[..index], script, &html[index..])
    } else {
        format!("{script}{html}")
    }
}

async fn persist_storage(context: &ServerContext, request: Request<Body>) -> Response<Body> {
    let bytes = match to_bytes(request.into_body(), 8 * 1024 * 1024).await {
        Ok(value) => value,
        Err(error) => return error_response(StatusCode::BAD_REQUEST, error.to_string()),
    };
    let snapshot: Value = match serde_json::from_slice(&bytes) {
        Ok(Value::Object(values)) => Value::Object(
            values
                .into_iter()
                .filter(|(_, value)| value.is_string())
                .collect(),
        ),
        _ => return error_response(StatusCode::BAD_REQUEST, "Invalid storage snapshot"),
    };
    let mut storage = context.state.frontend_storage.write().await;
    if !storage.is_object() {
        *storage = serde_json::json!({ "version": 1, "instances": {} });
    }
    let root = storage.as_object_mut().unwrap();
    let instances = root
        .entry("instances")
        .or_insert_with(|| serde_json::json!({}));
    if !instances.is_object() {
        *instances = serde_json::json!({});
    }
    let instance = instances
        .as_object_mut()
        .unwrap()
        .entry(context.instance.id.clone())
        .or_insert_with(|| serde_json::json!({}));
    if !instance.is_object() {
        *instance = serde_json::json!({});
    }
    instance
        .as_object_mut()
        .unwrap()
        .insert(storage_flavor(&context.flavor).into(), snapshot);
    if let Err(error) = context.state.storage.save_frontend_storage(&storage) {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    Response::new(Body::from("{\"ok\":true}"))
}

async fn navigate_back(context: &ServerContext) -> Response<Body> {
    if let Some(window) = context.state.app.get_webview_window(&context.window_label) {
        #[cfg(any(target_os = "windows", target_os = "android"))]
        let settings_url = "http://tauri.localhost/";
        #[cfg(not(any(target_os = "windows", target_os = "android")))]
        let settings_url = "tauri://localhost/";
        if let Ok(url) = Url::parse(settings_url) {
            let _ = window.navigate(url);
        }
    }
    Response::new(Body::from("{\"ok\":true}"))
}

async fn serve_asset(context: &ServerContext, path: &str) -> Response<Body> {
    let relative = path.trim_start_matches('/');
    let logical = if relative.is_empty() {
        format!("apps/{}/index.html", context.asset_flavor)
    } else {
        format!("apps/{}/{}", context.asset_flavor, relative)
    };
    let resolve = |logical: &str| {
        context
            .state
            .asset_aliases
            .get(logical)
            .cloned()
            .unwrap_or_else(|| logical.to_string())
    };
    let mut resolved = resolve(&logical);
    let mut asset = context.state.app.asset_resolver().get(resolved.clone());
    if asset.is_none() {
        resolved = resolve(&format!("apps/{}/index.html", context.asset_flavor));
        asset = context.state.app.asset_resolver().get(resolved);
    }
    let Some(mut asset) = asset else {
        return error_response(StatusCode::NOT_FOUND, "Frontend asset not found");
    };
    if logical.ends_with("index.html") || asset.mime_type.contains("text/html") {
        match String::from_utf8(std::mem::take(&mut asset.bytes)) {
            Ok(html) => asset.bytes = inject_bootstrap(html, context).await.into_bytes(),
            Err(error) => asset.bytes = error.into_bytes(),
        }
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, asset.mime_type)
        .header(
            header::CACHE_CONTROL,
            if logical.ends_with("index.html") {
                "no-store"
            } else {
                "public, max-age=31536000, immutable"
            },
        )
        .header("x-content-type-options", "nosniff")
        .header("referrer-policy", "strict-origin-when-cross-origin")
        .body(Body::from(asset.bytes))
        .unwrap()
}

fn cookie_pair(value: &str) -> Option<(String, Option<String>)> {
    let mut parts = value.split(';');
    let first = parts.next()?;
    let (name, value) = first.split_once('=')?;
    let remove = value.trim().is_empty()
        || parts.any(|part| {
            let lower = part.trim().to_ascii_lowercase();
            lower == "max-age=0" || lower.starts_with("max-age=-")
        });
    Some((
        name.trim().to_string(),
        (!remove).then(|| value.trim().to_string()),
    ))
}

fn rewrite_set_cookie(value: &str) -> String {
    value
        .split(';')
        .filter(|part| {
            let lower = part.trim().to_ascii_lowercase();
            !lower.starts_with("domain=") && lower != "secure"
        })
        .map(|part| {
            if part.trim().eq_ignore_ascii_case("samesite=none") {
                " SameSite=Lax".to_string()
            } else {
                format!(";{}", part).trim_start_matches(';').to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(";")
}

async fn proxy_request(context: &ServerContext, request: Request<Body>) -> Response<Body> {
    let (parts, body) = request.into_parts();
    let target = match Url::parse(&context.instance.base_url)
        .and_then(|base| base.join(&parts.uri.to_string()))
    {
        Ok(value) => value,
        Err(error) => return error_response(StatusCode::BAD_REQUEST, error.to_string()),
    };
    let mut outgoing = context
        .state
        .http
        .request(parts.method.clone(), target)
        .body(reqwest::Body::wrap_stream(body.into_data_stream()));
    for (name, value) in &parts.headers {
        if matches!(
            name.as_str(),
            "host" | "connection" | "content-length" | "accept-encoding" | "cookie"
        ) {
            continue;
        }
        outgoing = outgoing.header(name, value);
    }
    if context.instance.auth_mode == "accessToken" {
        if !context.instance.access_token.is_empty() {
            outgoing = outgoing.header(header::AUTHORIZATION, &context.instance.access_token);
        }
    } else {
        let jars = context.state.cookie_jars.read().await;
        let stored = jars
            .get(&context.instance.id)
            .map(|jar| {
                jar.iter()
                    .map(|(name, value)| format!("{name}={value}"))
                    .collect::<Vec<_>>()
                    .join("; ")
            })
            .unwrap_or_default();
        let incoming = parts
            .headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        let cookie = match (stored.is_empty(), incoming.is_empty()) {
            (false, false) => format!("{incoming}; {stored}"),
            (false, true) => stored,
            (true, false) => incoming.to_string(),
            _ => String::new(),
        };
        if !cookie.is_empty() {
            outgoing = outgoing.header(header::COOKIE, cookie);
        }
    }
    if !context.instance.user_id.is_empty() && !parts.headers.contains_key("new-api-user") {
        outgoing = outgoing.header("new-api-user", &context.instance.user_id);
    }
    let response = match outgoing.send().await {
        Ok(value) => value,
        Err(error) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                format!("Unable to reach backend: {error}"),
            )
        }
    };
    let status = response.status();
    let set_cookies: Vec<String> = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(ToOwned::to_owned))
        .collect();
    if context.instance.auth_mode != "accessToken" && !set_cookies.is_empty() {
        let mut jars = context.state.cookie_jars.write().await;
        let jar = jars.entry(context.instance.id.clone()).or_default();
        for cookie in &set_cookies {
            if let Some((name, value)) = cookie_pair(cookie) {
                match value {
                    Some(value) => {
                        jar.insert(name, value);
                    }
                    None => {
                        jar.remove(&name);
                    }
                }
            }
        }
        if let Err(error) = context.state.storage.save_backend_cookies(&jars) {
            log::warn!("failed to persist backend cookies: {error}");
        }
    }
    let path = parts.uri.path().to_string();
    if context.instance.auth_mode == "accessToken"
        && path == "/api/user/passkey"
        && status == StatusCode::UNAUTHORIZED
    {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Body::from(
                r#"{"success":true,"message":"","data":{"enabled":false,"desktop_access_token":true}}"#,
            ))
            .unwrap();
    }
    let capture_user = path == "/api/user/self"
        && status.is_success()
        && response.content_length().unwrap_or(0) <= 2 * 1024 * 1024;
    let mut builder = Response::builder().status(status);
    for (name, value) in response.headers() {
        if matches!(
            name.as_str(),
            "content-length" | "content-encoding" | "set-cookie" | "connection"
        ) {
            continue;
        }
        builder = builder.header(name, value);
    }
    for cookie in set_cookies {
        if let Ok(value) = HeaderValue::from_str(&rewrite_set_cookie(&cookie)) {
            builder = builder.header(header::SET_COOKIE, value);
        }
    }
    if capture_user {
        return match response.bytes().await {
            Ok(bytes) => {
                if let Ok(data) = serde_json::from_slice::<Value>(&bytes) {
                    let _ = crate::commands::capture_user_response(
                        &context.state,
                        &context.instance.id,
                        &data,
                    )
                    .await;
                }
                builder.body(Body::from(bytes)).unwrap()
            }
            Err(error) => error_response(StatusCode::BAD_GATEWAY, error.to_string()),
        };
    }
    builder
        .body(Body::from_stream(
            response
                .bytes_stream()
                .map(|result| result.map_err(std::io::Error::other)),
        ))
        .unwrap()
}

async fn handler(
    AxumState(context): AxumState<Arc<ServerContext>>,
    request: Request<Body>,
) -> Response<Body> {
    let path = request.uri().path().to_string();
    if path == "/__desktop/storage" && request.method() == axum::http::Method::POST {
        return persist_storage(&context, request).await;
    }
    if path == "/__desktop/back" && request.method() == axum::http::Method::POST {
        return navigate_back(&context).await;
    }
    if should_proxy(&path) {
        proxy_request(&context, request).await
    } else {
        serve_asset(&context, &path).await
    }
}

async fn selected_asset_flavor(state: &AppState, instance: &Instance, flavor: &str) -> String {
    if flavor == "classic" {
        return "classic".into();
    }
    let Ok(base) = Url::parse(&instance.base_url) else {
        return "default".into();
    };
    let Ok(url) = base.join("/457") else {
        return "default".into();
    };
    let mut request = state.http.get(url);
    if instance.auth_mode == "accessToken" && !instance.access_token.is_empty() {
        request = request.header(header::AUTHORIZATION, &instance.access_token);
    }
    match request
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => match response.json::<Value>().await {
            Ok(value) if value.get("457") == Some(&Value::Bool(true)) => "xuancat".into(),
            _ => "default".into(),
        },
        _ => "default".into(),
    }
}

#[cfg(desktop)]
fn current_window_state(
    window: &tauri::WebviewWindow,
    label: &str,
    instance_id: &str,
    flavor: &str,
) -> OpenWindowState {
    let position = window.outer_position().ok();
    let size = window.inner_size().ok();
    OpenWindowState {
        label: label.to_string(),
        instance_id: instance_id.to_string(),
        flavor: flavor.to_string(),
        bounds: WindowBounds {
            x: position.map(|value| value.x),
            y: position.map(|value| value.y),
            width: size.map(|value| value.width),
            height: size.map(|value| value.height),
        },
        maximized: window.is_maximized().unwrap_or(false),
    }
}

#[cfg(desktop)]
async fn persist_window_state(
    state: &AppState,
    label: &str,
    window_state: Option<OpenWindowState>,
) {
    let snapshot = {
        let mut config = state.config.write().await;
        if let Some(window_state) = window_state {
            if let Some(existing) = config
                .open_windows
                .iter_mut()
                .find(|item| item.label == label)
            {
                *existing = window_state;
            } else {
                config.open_windows.push(window_state);
            }
        } else {
            config.open_windows.retain(|item| item.label != label);
        }
        config.clone()
    };
    if let Err(error) = state.storage.save_config(&snapshot) {
        log::warn!("failed to persist open windows: {error}");
    }
}

#[cfg(desktop)]
async fn schedule_window_state_save(
    state: Arc<AppState>,
    label: String,
    instance_id: String,
    flavor: String,
) {
    if let Some(previous) = state.window_save_tasks.write().await.remove(&label) {
        previous.abort();
    }
    let app = state.app.clone();
    let state_for_task = state.clone();
    let label_for_task = label.clone();
    let task = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        let window_state = app
            .get_webview_window(&label_for_task)
            .map(|window| current_window_state(&window, &label_for_task, &instance_id, &flavor));
        if let Some(window_state) = window_state {
            persist_window_state(&state_for_task, &label_for_task, Some(window_state)).await;
        }
    });
    state.window_save_tasks.write().await.insert(label, task);
}

pub async fn open_frontend_window(
    app: &AppHandle,
    state: &Arc<AppState>,
    options: Value,
) -> Result<Value, String> {
    let instance_id = options
        .get("instanceId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let flavor = if options.get("flavor").and_then(Value::as_str) == Some("classic") {
        "classic"
    } else {
        "default"
    };
    let instance = {
        let config = state.config.read().await;
        config
            .instances
            .iter()
            .find(|item| item.id == instance_id)
            .or_else(|| {
                config
                    .instances
                    .iter()
                    .find(|item| item.id == config.active_instance_id)
            })
            .cloned()
            .ok_or_else(|| "No backend instance is configured.".to_string())?
    };
    let asset_flavor = selected_asset_flavor(state, &instance, flavor).await;
    let label = if cfg!(mobile) {
        "main".to_string()
    } else {
        format!("app-{}", Uuid::new_v4().simple())
    };
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let context = Arc::new(ServerContext {
        state: state.clone(),
        instance: instance.clone(),
        flavor: flavor.into(),
        asset_flavor: asset_flavor.clone(),
        window_label: label.clone(),
    });
    let router = Router::new().fallback(any(handler)).with_state(context);
    let server = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    state.servers.write().await.insert(label.clone(), server);
    let url_text = format!("http://127.0.0.1:{port}/");
    let url = Url::parse(&url_text).map_err(|error| error.to_string())?;
    if cfg!(mobile) {
        app.get_webview_window("main")
            .ok_or_else(|| "Main mobile webview is unavailable".to_string())?
            .navigate(url)
            .map_err(|error| error.to_string())?;
    } else {
        #[cfg(desktop)]
        {
            let allowed_origin = format!("http://127.0.0.1:{port}");
            let app_for_navigation = app.clone();
            let state_for_close = state.clone();
            let label_for_close = label.clone();
            let instance_id_for_events = instance.id.clone();
            let flavor_for_events = flavor.to_string();
            let title = format!(
                "New API Desktop - {} - {}",
                if flavor == "classic" {
                    "Classic"
                } else if asset_flavor == "xuancat" {
                    "Xuancat"
                } else {
                    "Default"
                },
                instance.name
            );
            let bounds = options.get("bounds");
            let width = bounds
                .and_then(|value| value.get("width"))
                .and_then(Value::as_u64)
                .unwrap_or(1320)
                .clamp(980, 7680) as f64;
            let height = bounds
                .and_then(|value| value.get("height"))
                .and_then(Value::as_u64)
                .unwrap_or(860)
                .clamp(640, 4320) as f64;
            let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
                .title(title)
                .inner_size(width, height)
                .min_inner_size(980.0, 640.0)
                .on_navigation(move |target| {
                    if target.as_str().starts_with(&allowed_origin)
                        || target.scheme() == "tauri"
                        || target.host_str() == Some("tauri.localhost")
                    {
                        true
                    } else {
                        let _ = tauri_plugin_opener::OpenerExt::opener(&app_for_navigation)
                            .open_url(target.as_str(), None::<&str>);
                        false
                    }
                });
            if let (Some(x), Some(y)) = (
                bounds
                    .and_then(|value| value.get("x"))
                    .and_then(Value::as_i64),
                bounds
                    .and_then(|value| value.get("y"))
                    .and_then(Value::as_i64),
            ) {
                builder = builder.position(x as f64, y as f64);
            }
            let window = builder.build().map_err(|error| error.to_string())?;
            if options
                .get("maximized")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                let _ = window.maximize();
            }
            persist_window_state(
                state,
                &label,
                Some(current_window_state(&window, &label, &instance.id, flavor)),
            )
            .await;
            window.on_window_event(move |event| match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    let state = state_for_close.clone();
                    let label = label_for_close.clone();
                    let instance_id = instance_id_for_events.clone();
                    let flavor = flavor_for_events.clone();
                    tauri::async_runtime::spawn(async move {
                        schedule_window_state_save(state, label, instance_id, flavor).await;
                    });
                }
                WindowEvent::Destroyed => {
                    let state = state_for_close.clone();
                    let label = label_for_close.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(server) = state.servers.write().await.remove(&label) {
                            server.abort();
                        }
                        if let Some(task) = state.window_save_tasks.write().await.remove(&label) {
                            task.abort();
                        }
                        if !state.is_exiting.load(Ordering::SeqCst) {
                            persist_window_state(&state, &label, None).await;
                        }
                    });
                }
                _ => {}
            });
        }
    }
    Ok(serde_json::json!({
        "label": label,
        "url": url_text,
        "instanceId": instance.id,
        "flavor": flavor,
        "assetFlavor": asset_flavor
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_removes_backend_cookies_safely() {
        assert_eq!(
            cookie_pair("session=abc123; HttpOnly; Path=/"),
            Some(("session".into(), Some("abc123".into())))
        );
        assert_eq!(
            cookie_pair("session=; Max-Age=0; Path=/"),
            Some(("session".into(), None))
        );
        assert_eq!(
            cookie_pair("session=old; Max-Age=-1; Path=/"),
            Some(("session".into(), None))
        );
    }
}
