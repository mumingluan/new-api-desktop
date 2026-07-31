use std::{io::Write, sync::Arc, time::Duration};

use chrono::{Datelike, Duration as ChronoDuration, Local, SecondsFormat, Utc};
use serde_json::Value;
use sqlx::{
    mysql::{MySqlConnectOptions, MySqlPoolOptions, MySqlSslMode},
    MySql, QueryBuilder,
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FsExt, OpenOptions};
use tauri_plugin_updater::UpdaterExt;
use url::Url;
use uuid::Uuid;

use crate::{
    models::{
        BackendStatus, BatchOperationInput, BatchOperationResult, Instance, InstanceInput,
        KeyBatchProfile, KeyBatchProfileInput, KeyQueryInput, KeyQueryLog, KeyQueryProfile,
        KeyQueryResult, PublicConfig, PublicInstance, PublicKeyBatchProfile, StatsInput, StatsRow,
    },
    proxy,
    state::AppState,
};

const QUOTA_PER_USD: f64 = 500_000.0;
const LANGUAGES: &[&str] = &["auto", "en", "zh", "fr", "ja", "ru", "vi"];

fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn normalize_base_url(value: &str) -> Result<String, String> {
    let raw = value.trim();
    if raw.is_empty() {
        return Err("服务器地址不能为空".into());
    }
    if let Some((scheme, _)) = raw.split_once("://") {
        if !matches!(scheme.to_ascii_lowercase().as_str(), "http" | "https") {
            return Err("服务器地址仅支持 HTTP 或 HTTPS".into());
        }
    }
    let candidate = if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let mut url = Url::parse(&candidate).map_err(|_| "服务器地址无效")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("服务器地址仅支持 HTTP 或 HTTPS".into());
    }
    url.set_query(None);
    url.set_fragment(None);
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn sanitize_instance(
    input: InstanceInput,
    existing: Option<&Instance>,
) -> Result<Instance, String> {
    let base_url = normalize_base_url(&input.base_url)?;
    let timestamp = now();
    let access_token = input
        .access_token
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            existing
                .map(|item| item.access_token.clone())
                .unwrap_or_default()
        });
    let flavor = match input
        .flavor
        .as_deref()
        .or(existing.map(|item| item.flavor.as_str()))
    {
        Some("classic") => "classic",
        _ => "default",
    };
    let auth_mode = match input
        .auth_mode
        .as_deref()
        .or(existing.map(|item| item.auth_mode.as_str()))
    {
        Some("accessToken") => "accessToken",
        _ => "interactive",
    };
    let name = input.name.unwrap_or_default().trim().to_string();
    Ok(Instance {
        id: input
            .id
            .or_else(|| existing.map(|item| item.id.clone()))
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: if name.is_empty() {
            Url::parse(&base_url)
                .ok()
                .and_then(|url| url.host_str().map(ToOwned::to_owned))
                .unwrap_or_else(|| base_url.clone())
        } else {
            name
        },
        base_url,
        auth_mode: auth_mode.into(),
        access_token,
        user_id: input
            .user_id
            .unwrap_or_else(|| {
                existing
                    .map(|item| item.user_id.clone())
                    .unwrap_or_default()
            })
            .trim()
            .to_string(),
        flavor: flavor.into(),
        user: input
            .user
            .or_else(|| existing.and_then(|item| item.user.clone())),
        created_at: input
            .created_at
            .or_else(|| existing.map(|item| item.created_at.clone()))
            .unwrap_or_else(|| timestamp.clone()),
        updated_at: timestamp,
    })
}

async fn public_config(state: &AppState) -> PublicConfig {
    let config = state.config.read().await.clone();
    let status = state.status.read().await.clone();
    let active_instance = config
        .instances
        .iter()
        .find(|item| item.id == config.active_instance_id)
        .map(PublicInstance::from);
    PublicConfig {
        instances: config.instances.iter().map(PublicInstance::from).collect(),
        active_instance_id: config.active_instance_id,
        active_flavor: config.active_flavor,
        desktop_language: config.desktop_language,
        update_feed_url: config.update_feed_url,
        open_windows: config.open_windows,
        active_instance,
        desktop_url: String::new(),
        app_locale: std::env::var("LANG").unwrap_or_else(|_| "en".into()),
        status,
        mobile: cfg!(mobile),
    }
}

async fn persist_and_broadcast(state: &AppState) -> Result<PublicConfig, String> {
    let config = state.config.read().await.clone();
    state.storage.save_config(&config).map_err(command_error)?;
    let public = public_config(state).await;
    state
        .app
        .emit("desktop-config-changed", &public)
        .map_err(command_error)?;
    #[cfg(desktop)]
    crate::tray::refresh_tray(&state.app, &config).map_err(command_error)?;
    Ok(public)
}

#[tauri::command]
pub async fn get_config(state: State<'_, Arc<AppState>>) -> Result<PublicConfig, String> {
    Ok(public_config(&state).await)
}

#[tauri::command]
pub async fn save_instance(
    state: State<'_, Arc<AppState>>,
    input: InstanceInput,
) -> Result<PublicConfig, String> {
    let mut config = state.config.write().await;
    let existing = input
        .id
        .as_ref()
        .and_then(|id| config.instances.iter().find(|item| &item.id == id))
        .cloned();
    let instance = sanitize_instance(input, existing.as_ref())?;
    if let Some(index) = config
        .instances
        .iter()
        .position(|item| item.id == instance.id)
    {
        config.instances[index] = instance.clone();
    } else {
        config.instances.push(instance.clone());
    }
    config.active_instance_id = instance.id;
    config.active_flavor = instance.flavor;
    drop(config);
    persist_and_broadcast(&state).await
}

#[tauri::command]
pub async fn delete_instance(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<PublicConfig, String> {
    let mut config = state.config.write().await;
    config.instances.retain(|item| item.id != id);
    config.open_windows.retain(|item| item.instance_id != id);
    if config.active_instance_id == id {
        config.active_instance_id = config
            .instances
            .first()
            .map(|item| item.id.clone())
            .unwrap_or_default();
    }
    drop(config);
    {
        let mut jars = state.cookie_jars.write().await;
        jars.remove(&id);
        state
            .storage
            .save_backend_cookies(&jars)
            .map_err(command_error)?;
    }
    {
        let mut storage = state.frontend_storage.write().await;
        if let Some(instances) = storage.get_mut("instances").and_then(Value::as_object_mut) {
            instances.remove(&id);
        }
        state
            .storage
            .save_frontend_storage(&storage)
            .map_err(command_error)?;
    }
    persist_and_broadcast(&state).await
}

#[tauri::command]
pub async fn set_active_instance(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<PublicConfig, String> {
    let mut config = state.config.write().await;
    let flavor = config
        .instances
        .iter()
        .find(|item| item.id == id)
        .map(|item| item.flavor.clone())
        .ok_or_else(|| "Instance not found".to_string())?;
    config.active_instance_id = id;
    config.active_flavor = flavor;
    drop(config);
    persist_and_broadcast(&state).await
}

#[tauri::command]
pub async fn set_flavor(
    state: State<'_, Arc<AppState>>,
    flavor: String,
) -> Result<PublicConfig, String> {
    let value = if flavor == "classic" {
        "classic"
    } else {
        "default"
    };
    let mut config = state.config.write().await;
    config.active_flavor = value.into();
    let active_id = config.active_instance_id.clone();
    if let Some(instance) = config
        .instances
        .iter_mut()
        .find(|item| item.id == active_id)
    {
        instance.flavor = value.into();
        instance.updated_at = now();
    }
    drop(config);
    persist_and_broadcast(&state).await
}

#[tauri::command]
pub async fn set_language(
    state: State<'_, Arc<AppState>>,
    language: String,
) -> Result<PublicConfig, String> {
    let mut config = state.config.write().await;
    config.desktop_language = if LANGUAGES.contains(&language.as_str()) {
        language
    } else {
        "auto".into()
    };
    drop(config);
    persist_and_broadcast(&state).await
}

async fn backend_request(
    state: &AppState,
    instance: &Instance,
    path: &str,
) -> Result<(u16, Value), String> {
    let url = Url::parse(&instance.base_url)
        .and_then(|base| base.join(path))
        .map_err(command_error)?;
    let mut request = state.http.get(url).header("Accept", "application/json");
    if instance.auth_mode == "accessToken" && !instance.access_token.is_empty() {
        request = request.header("Authorization", &instance.access_token);
    }
    if !instance.user_id.is_empty() {
        request = request.header("New-Api-User", &instance.user_id);
    }
    let response = request.send().await.map_err(command_error)?;
    let status = response.status().as_u16();
    let data = response.json::<Value>().await.unwrap_or(Value::Null);
    Ok((status, data))
}

fn capture_user(instance: &mut Instance, data: &Value) -> bool {
    let Some(user) = data.get("data").filter(|value| value.is_object()) else {
        return false;
    };
    let Some(id) = user.get("id") else {
        return false;
    };
    instance.user_id = match id {
        Value::String(value) => value.clone(),
        _ => id.to_string(),
    };
    instance.user = Some(user.clone());
    instance.updated_at = now();
    true
}

pub(crate) async fn capture_user_response(
    state: &AppState,
    instance_id: &str,
    data: &Value,
) -> Result<(), String> {
    let changed = {
        let mut config = state.config.write().await;
        config
            .instances
            .iter_mut()
            .find(|item| item.id == instance_id)
            .map(|instance| capture_user(instance, data))
            .unwrap_or(false)
    };
    if changed {
        persist_and_broadcast(state).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn refresh_status(state: State<'_, Arc<AppState>>) -> Result<BackendStatus, String> {
    let instance = {
        let config = state.config.read().await;
        config
            .instances
            .iter()
            .find(|item| item.id == config.active_instance_id)
            .cloned()
    };
    let status = if let Some(instance) = instance {
        match backend_request(&state, &instance, "/api/user/self").await {
            Ok((code, data)) => {
                if code == 200 && data.get("success") != Some(&Value::Bool(false)) {
                    let mut config = state.config.write().await;
                    if let Some(saved) = config
                        .instances
                        .iter_mut()
                        .find(|item| item.id == instance.id)
                    {
                        capture_user(saved, &data);
                    }
                    drop(config);
                    let _ = persist_and_broadcast(&state).await;
                    BackendStatus {
                        ok: true,
                        message: "Online".into(),
                        checked_at: Some(now()),
                    }
                } else {
                    BackendStatus {
                        ok: false,
                        message: data
                            .get("message")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("HTTP {code}")),
                        checked_at: Some(now()),
                    }
                }
            }
            Err(error) => BackendStatus {
                ok: false,
                message: error,
                checked_at: Some(now()),
            },
        }
    } else {
        BackendStatus {
            ok: false,
            message: "No backend configured".into(),
            checked_at: Some(now()),
        }
    };
    *state.status.write().await = status.clone();
    Ok(status)
}

#[tauri::command]
pub async fn validate_access_token(
    state: State<'_, Arc<AppState>>,
    input: InstanceInput,
) -> Result<PublicInstance, String> {
    let saved = {
        let config = state.config.read().await;
        input
            .id
            .as_ref()
            .and_then(|id| config.instances.iter().find(|item| &item.id == id))
            .cloned()
    };
    let mut draft = sanitize_instance(input, saved.as_ref())?;
    draft.auth_mode = "accessToken".into();
    if draft.access_token.is_empty() {
        return Err("Access token is required".into());
    }
    if draft.user_id.is_empty() {
        return Err("User ID is required".into());
    }
    let (status, data) = backend_request(&state, &draft, "/api/user/self").await?;
    if status < 200 || status >= 300 || data.get("success") == Some(&Value::Bool(false)) {
        return Err(data
            .get("message")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("Validation failed with HTTP {status}")));
    }
    capture_user(&mut draft, &data);
    if saved.is_some() {
        let mut config = state.config.write().await;
        if let Some(item) = config.instances.iter_mut().find(|item| item.id == draft.id) {
            *item = draft.clone();
        }
        drop(config);
        persist_and_broadcast(&state).await?;
    }
    Ok(PublicInstance::from(&draft))
}

#[tauri::command]
pub async fn get_key_query_profiles(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<KeyQueryProfile>, String> {
    Ok(state.key_query_profiles.read().await.clone())
}

#[tauri::command]
pub async fn save_key_query_profile(
    state: State<'_, Arc<AppState>>,
    profile: Value,
) -> Result<KeyQueryProfile, String> {
    let id = profile
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let mut profiles = state.key_query_profiles.write().await;
    let existing = id
        .as_ref()
        .and_then(|id| profiles.iter().find(|item| &item.id == id))
        .cloned();
    let base_url = normalize_base_url(
        profile
            .get("baseUrl")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )?;
    let api_key = profile
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(|value| {
            value
                .strip_prefix("Bearer ")
                .or_else(|| value.strip_prefix("bearer "))
                .unwrap_or(value)
        })
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| existing.as_ref().map(|item| item.api_key.clone()))
        .ok_or_else(|| "密钥不能为空".to_string())?;
    let timestamp = now();
    let saved = KeyQueryProfile {
        id: id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: profile
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string(),
        base_url,
        api_key,
        created_at: existing
            .as_ref()
            .map(|item| item.created_at.clone())
            .unwrap_or_else(|| timestamp.clone()),
        updated_at: timestamp,
    };
    let mut saved = saved;
    if saved.name.is_empty() {
        saved.name = Url::parse(&saved.base_url)
            .ok()
            .and_then(|url| url.host_str().map(ToOwned::to_owned))
            .unwrap_or_else(|| saved.base_url.clone());
    }
    if let Some(index) = profiles.iter().position(|item| item.id == saved.id) {
        profiles[index] = saved.clone();
    } else {
        profiles.push(saved.clone());
    }
    state
        .storage
        .save_key_query_profiles(&profiles)
        .map_err(command_error)?;
    Ok(saved)
}

#[tauri::command]
pub async fn delete_key_query_profile(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<bool, String> {
    let mut profiles = state.key_query_profiles.write().await;
    let previous = profiles.len();
    profiles.retain(|item| item.id != id);
    if profiles.len() != previous {
        state
            .storage
            .save_key_query_profiles(&profiles)
            .map_err(command_error)?;
    }
    Ok(profiles.len() != previous)
}

async fn get_json(state: &AppState, url: Url, api_key: &str) -> Result<Value, String> {
    let response = state
        .http
        .get(url)
        .header("Accept", "application/json")
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(25))
        .send()
        .await
        .map_err(command_error)?;
    let status = response.status();
    let body = response.text().await.map_err(command_error)?;
    let data: Value = serde_json::from_str(&body)
        .map_err(|_| format!("接口返回了无效 JSON：HTTP {}", status.as_u16()))?;
    if !status.is_success() {
        return Err(data
            .get("message")
            .or_else(|| data.get("error"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16())));
    }
    Ok(data)
}

fn value_number(value: Option<&Value>) -> f64 {
    value
        .and_then(|value| {
            value
                .as_f64()
                .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
        })
        .unwrap_or_default()
}

fn value_i64(value: Option<&Value>) -> i64 {
    value_number(value) as i64
}

#[tauri::command]
pub async fn query_token(
    state: State<'_, Arc<AppState>>,
    input: KeyQueryInput,
) -> Result<KeyQueryResult, String> {
    let base_url = normalize_base_url(&input.base_url)?;
    let api_key = input
        .api_key
        .trim()
        .strip_prefix("Bearer ")
        .unwrap_or(input.api_key.trim())
        .to_string();
    if api_key.is_empty() {
        return Err("请输入密钥".into());
    }
    let base = Url::parse(&base_url).map_err(command_error)?;
    let today = Local::now().date_naive();
    let start = today - ChronoDuration::days(90);
    let end = today + ChronoDuration::days(1);
    let subscription_url = base
        .join("/v1/dashboard/billing/subscription")
        .map_err(command_error)?;
    let usage_url = base
        .join(&format!(
            "/v1/dashboard/billing/usage?start_date={:04}-{:02}-{:02}&end_date={:04}-{:02}-{:02}",
            start.year(),
            start.month(),
            start.day(),
            end.year(),
            end.month(),
            end.day()
        ))
        .map_err(command_error)?;
    let logs_url = base.join("/api/log/token").map_err(command_error)?;
    let mut logs_url = logs_url;
    logs_url.query_pairs_mut().append_pair("key", &api_key);
    let (subscription, usage, logs_response) = tokio::try_join!(
        get_json(&state, subscription_url, &api_key),
        get_json(&state, usage_url, &api_key),
        get_json(&state, logs_url, &api_key)
    )?;
    if logs_response.get("success") != Some(&Value::Bool(true)) {
        return Err(logs_response
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("查询调用记录失败")
            .to_string());
    }
    let rows = logs_response
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "查询调用记录失败".to_string())?;
    let subscription_token = subscription
        .get("token_name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let logs: Vec<KeyQueryLog> = rows
        .iter()
        .filter(|row| matches!(value_i64(row.get("type")), 0 | 2))
        .map(|row| {
            let other = row
                .get("other")
                .and_then(|value| {
                    value.as_object().cloned().map(Value::Object).or_else(|| {
                        value
                            .as_str()
                            .and_then(|text| serde_json::from_str::<Value>(text).ok())
                    })
                })
                .unwrap_or(Value::Null);
            KeyQueryLog {
                created_at: value_i64(row.get("created_at")),
                token_name: row
                    .get("token_name")
                    .and_then(Value::as_str)
                    .unwrap_or(subscription_token)
                    .to_string(),
                group: row
                    .get("group")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                model_name: row
                    .get("model_name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                use_time: value_number(row.get("use_time")),
                is_stream: row
                    .get("is_stream")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                    || value_i64(row.get("is_stream")) == 1,
                prompt_tokens: value_i64(row.get("prompt_tokens")),
                completion_tokens: value_i64(row.get("completion_tokens")),
                quota: value_i64(row.get("quota")),
                content: row
                    .get("content")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                model_ratio: value_number(other.get("model_ratio")).max(1.0),
                group_ratio: value_number(other.get("group_ratio")).max(1.0),
            }
        })
        .collect();
    Ok(KeyQueryResult {
        server: base_url,
        token_name: subscription_token
            .to_string()
            .or_else(|| logs.first().map(|item| item.token_name.clone())),
        balance: value_number(subscription.get("hard_limit_usd")),
        usage: value_number(usage.get("total_usage")) / 100.0,
        access_until: value_i64(subscription.get("access_until")),
        logs,
    })
}

trait StringFallback {
    fn or_else(self, fallback: impl FnOnce() -> Option<String>) -> String;
}

impl StringFallback for String {
    fn or_else(self, fallback: impl FnOnce() -> Option<String>) -> String {
        if self.is_empty() {
            fallback().unwrap_or_default()
        } else {
            self
        }
    }
}

fn sanitize_batch_profile(
    input: KeyBatchProfileInput,
    existing: Option<&KeyBatchProfile>,
) -> Result<KeyBatchProfile, String> {
    let host = input.host.trim().to_string();
    let user = input.user.trim().to_string();
    let database = input.database.trim().to_string();
    let port = input.port.unwrap_or(3306);
    if host.is_empty() {
        return Err("Host 不能为空".into());
    }
    if user.is_empty() {
        return Err("用户名不能为空".into());
    }
    if database.is_empty() {
        return Err("数据库不能为空".into());
    }
    let timestamp = now();
    let tls_mode = match input.tls_mode.as_deref() {
        Some("verify_identity") => "verify_identity",
        Some("verify_ca") => "verify_ca",
        Some("required") => "required",
        Some("disabled") => "disabled",
        _ => "preferred",
    };
    Ok(KeyBatchProfile {
        id: input
            .id
            .or_else(|| existing.map(|item| item.id.clone()))
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: input
            .name
            .unwrap_or_default()
            .trim()
            .to_string()
            .or_else(|| Some(format!("{user}@{host}"))),
        host,
        port,
        user,
        password: input
            .password
            .filter(|value| !value.is_empty())
            .or_else(|| existing.map(|item| item.password.clone()))
            .unwrap_or_default(),
        database,
        tls_mode: tls_mode.into(),
        created_at: existing
            .map(|item| item.created_at.clone())
            .unwrap_or_else(|| timestamp.clone()),
        updated_at: timestamp,
    })
}

#[tauri::command]
pub async fn get_key_batch_profiles(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PublicKeyBatchProfile>, String> {
    Ok(state
        .key_batch_profiles
        .read()
        .await
        .iter()
        .map(PublicKeyBatchProfile::from)
        .collect())
}

#[tauri::command]
pub async fn save_key_batch_profile(
    state: State<'_, Arc<AppState>>,
    profile: KeyBatchProfileInput,
) -> Result<PublicKeyBatchProfile, String> {
    let mut profiles = state.key_batch_profiles.write().await;
    let existing = profile
        .id
        .as_ref()
        .and_then(|id| profiles.iter().find(|item| &item.id == id))
        .cloned();
    let saved = sanitize_batch_profile(profile, existing.as_ref())?;
    if let Some(index) = profiles.iter().position(|item| item.id == saved.id) {
        profiles[index] = saved.clone();
    } else {
        profiles.push(saved.clone());
    }
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    state
        .storage
        .save_key_batch_profiles(&profiles)
        .map_err(command_error)?;
    Ok(PublicKeyBatchProfile::from(&saved))
}

#[tauri::command]
pub async fn delete_key_batch_profile(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<bool, String> {
    let mut profiles = state.key_batch_profiles.write().await;
    let previous = profiles.len();
    profiles.retain(|item| item.id != id);
    if profiles.len() != previous {
        state
            .storage
            .save_key_batch_profiles(&profiles)
            .map_err(command_error)?;
    }
    Ok(profiles.len() != previous)
}

#[tauri::command]
pub async fn connect_key_batch_database(
    state: State<'_, Arc<AppState>>,
    input: KeyBatchProfileInput,
) -> Result<Value, String> {
    let existing = {
        let profiles = state.key_batch_profiles.read().await;
        input
            .id
            .as_ref()
            .and_then(|id| profiles.iter().find(|item| &item.id == id))
            .cloned()
    };
    let profile = sanitize_batch_profile(input, existing.as_ref())?;
    let ssl_mode = match profile.tls_mode.as_str() {
        "verify_identity" => MySqlSslMode::VerifyIdentity,
        "verify_ca" => MySqlSslMode::VerifyCa,
        "required" => MySqlSslMode::Required,
        "disabled" => MySqlSslMode::Disabled,
        _ => MySqlSslMode::Preferred,
    };
    let options = MySqlConnectOptions::new()
        .host(&profile.host)
        .port(profile.port)
        .username(&profile.user)
        .password(&profile.password)
        .database(&profile.database)
        .ssl_mode(ssl_mode)
        .statement_cache_capacity(32);
    let pool = MySqlPoolOptions::new()
        .max_connections(3)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .connect_with(options)
        .await
        .map_err(command_error)?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(command_error)?;
    let previous = state.mysql_pool.write().await.replace(pool);
    if let Some(previous) = previous {
        previous.close().await;
    }
    Ok(serde_json::json!({
        "host": profile.host,
        "port": profile.port,
        "user": profile.user,
        "database": profile.database,
        "tlsMode": profile.tls_mode
    }))
}

async fn mysql_pool(state: &AppState) -> Result<sqlx::MySqlPool, String> {
    state
        .mysql_pool
        .read()
        .await
        .clone()
        .ok_or_else(|| "尚未连接数据库".into())
}

#[tauri::command]
pub async fn get_key_batch_groups(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    let pool = mysql_pool(&state).await?;
    let raw: Option<String> =
        sqlx::query_scalar("SELECT `value` FROM options WHERE `key` = 'GroupRatio'")
            .fetch_optional(&pool)
            .await
            .map_err(command_error)?;
    let mut groups = raw
        .and_then(|value| serde_json::from_str::<Value>(&value).ok())
        .and_then(|value| value.as_object().cloned())
        .map(|value| value.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    if groups.is_empty() {
        groups.push("default".into());
    }
    groups.sort();
    Ok(groups)
}

#[tauri::command]
pub async fn count_key_batch_group(
    state: State<'_, Arc<AppState>>,
    group: String,
) -> Result<i64, String> {
    let group = group.trim();
    if group.is_empty() {
        return Err("请选择分组名".into());
    }
    let pool = mysql_pool(&state).await?;
    sqlx::query_scalar("SELECT COUNT(*) FROM tokens WHERE `group` = ? AND deleted_at IS NULL")
        .bind(group)
        .fetch_one(&pool)
        .await
        .map_err(command_error)
}

fn validate_non_negative(value: f64, label: &str) -> Result<f64, String> {
    if !value.is_finite() || value < 0.0 {
        Err(format!("{label}必须是非负数"))
    } else {
        Ok(value)
    }
}

#[tauri::command]
pub async fn execute_key_batch_operation(
    state: State<'_, Arc<AppState>>,
    input: BatchOperationInput,
) -> Result<BatchOperationResult, String> {
    let group = input.group.trim().to_string();
    if group.is_empty() {
        return Err("请选择分组名".into());
    }
    let seconds = (validate_non_negative(input.days, "天数")? * 86_400.0
        + validate_non_negative(input.hours, "小时")? * 3_600.0
        + validate_non_negative(input.minutes, "分钟")? * 60.0)
        .round() as i64;
    let quota = (validate_non_negative(input.dollars, "美元额度")? * QUOTA_PER_USD).round() as i64;
    let current = Utc::now().timestamp();
    let (label, sql, values): (&str, &str, Vec<i64>) = match input.mode.as_str() {
        "extend-time" if seconds > 0 => (
            "延长Token过期时间",
            "UPDATE tokens SET expired_time = CASE WHEN expired_time = -1 THEN -1 WHEN expired_time < ? THEN ? + ? ELSE expired_time + ? END WHERE `group` = ? AND deleted_at IS NULL AND expired_time != -1",
            vec![current, current, seconds, seconds],
        ),
        "add-quota" if quota > 0 => (
            "增加Token额度",
            "UPDATE tokens SET remain_quota = remain_quota + ? WHERE `group` = ? AND deleted_at IS NULL AND unlimited_quota = 0",
            vec![quota],
        ),
        "deduct-time" if seconds > 0 => (
            "扣除Token过期时间",
            "UPDATE tokens SET expired_time = CASE WHEN expired_time = -1 THEN -1 WHEN expired_time - ? < ? THEN ? ELSE expired_time - ? END WHERE `group` = ? AND deleted_at IS NULL AND expired_time != -1",
            vec![seconds, current, current, seconds],
        ),
        "deduct-quota" if quota > 0 => (
            "扣除Token额度",
            "UPDATE tokens SET remain_quota = CASE WHEN remain_quota - ? < 0 THEN 0 ELSE remain_quota - ? END WHERE `group` = ? AND deleted_at IS NULL AND unlimited_quota = 0",
            vec![quota, quota],
        ),
        "extend-time" | "deduct-time" => return Err("时间必须大于 0".into()),
        "add-quota" | "deduct-quota" => return Err("额度必须大于 0".into()),
        _ => return Err("未知批量操作模式".into()),
    };
    let mut query = sqlx::query(sql);
    for value in values {
        query = query.bind(value);
    }
    query = query.bind(&group);
    if input.used_only || input.min_enabled {
        // The fixed statements deliberately leave filters at the end. Rebuild only with
        // allowlisted clauses; no user-controlled SQL text is accepted.
        let mut sql = sql.to_string();
        if input.used_only {
            sql.push_str(" AND used_quota > 0");
        }
        if input.min_enabled {
            sql.push_str(" AND remain_quota > ?");
        }
        let mut rebuilt = sqlx::query(&sql);
        let base_values: Vec<i64> = match input.mode.as_str() {
            "extend-time" => vec![current, current, seconds, seconds],
            "add-quota" => vec![quota],
            "deduct-time" => vec![seconds, current, current, seconds],
            _ => vec![quota, quota],
        };
        for value in base_values {
            rebuilt = rebuilt.bind(value);
        }
        rebuilt = rebuilt.bind(&group);
        if input.min_enabled {
            rebuilt = rebuilt.bind(
                (validate_non_negative(input.min_usd, "最小剩余额度")? * QUOTA_PER_USD).round()
                    as i64,
            );
        }
        let result = rebuilt
            .execute(&mysql_pool(&state).await?)
            .await
            .map_err(command_error)?;
        return Ok(BatchOperationResult {
            affected_rows: result.rows_affected(),
            label: label.into(),
            group,
        });
    }
    let result = query
        .execute(&mysql_pool(&state).await?)
        .await
        .map_err(command_error)?;
    Ok(BatchOperationResult {
        affected_rows: result.rows_affected(),
        label: label.into(),
        group,
    })
}

fn optional_i64(value: &Option<Value>) -> Option<i64> {
    value.as_ref().and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
    })
}

#[tauri::command]
pub async fn query_key_batch_stats(
    state: State<'_, Arc<AppState>>,
    input: StatsInput,
) -> Result<Vec<StatsRow>, String> {
    if input.start <= 0 || input.end <= input.start {
        return Err("查询日期范围无效".into());
    }
    let group_field = match input.group_by.as_str() {
        "model_name" => "`model_name`",
        "username" => "`username`",
        "channel_name" => "`channel_name`",
        "user_id" => "`user_id`",
        _ => "`token_name`",
    };
    let sort_field = match input.sort_by.as_str() {
        "prompt_tokens" => "prompt_tokens",
        "completion_tokens" => "completion_tokens",
        "quota" => "quota",
        _ => "request_count",
    };
    let mut query = QueryBuilder::<MySql>::new(format!(
        "SELECT CAST({group_field} AS CHAR) AS name, \
         CAST(COUNT(*) AS SIGNED) AS request_count, \
         CAST(COALESCE(SUM(prompt_tokens), 0) AS SIGNED) AS prompt_tokens, \
         CAST(COALESCE(SUM(completion_tokens), 0) AS SIGNED) AS completion_tokens, \
         CAST(COALESCE(SUM(quota), 0) AS SIGNED) AS quota, \
         CAST(COUNT(DISTINCT user_id) AS SIGNED) AS unique_users \
         FROM logs WHERE created_at >= "
    ));
    query
        .push_bind(input.start)
        .push(" AND created_at < ")
        .push_bind(input.end)
        .push(" AND prompt_tokens > 0 AND completion_tokens > 0");
    if let Some(value) = optional_i64(&input.exclude_user_id) {
        query.push(" AND user_id != ").push_bind(value);
    }
    if let Some(value) = optional_i64(&input.user_id) {
        query.push(" AND user_id = ").push_bind(value);
    }
    if !input.model.trim().is_empty() {
        query
            .push(" AND model_name LIKE ")
            .push_bind(format!("%{}%", input.model.trim()));
    }
    if input.min_tokens > 1 {
        query
            .push(" AND (prompt_tokens + completion_tokens) >= ")
            .push_bind(input.min_tokens);
    }
    query
        .push(format!(
            " GROUP BY {group_field} HAVING name IS NOT NULL AND name != '' ORDER BY {sort_field} DESC LIMIT "
        ))
        .push_bind(input.top.clamp(1, 1000));
    query
        .build_query_as::<StatsRow>()
        .fetch_all(&mysql_pool(&state).await?)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn open_window(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    options: Value,
) -> Result<Value, String> {
    proxy::open_frontend_window(&app, &state, options).await
}

#[tauri::command]
pub async fn open_tool_window(app: AppHandle, tool: String) -> Result<(), String> {
    crate::windows::open_tool_window(&app, &tool).map_err(command_error)
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(command_error)?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err("Unsupported external URL scheme".into());
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(command_error)
}

#[tauri::command]
pub async fn replace_frontend_storage() -> Result<bool, String> {
    // Business webviews persist through a localhost endpoint, not broad remote IPC.
    Ok(true)
}

#[tauri::command]
pub async fn export_csv(app: AppHandle, content: String, kind: String) -> Result<bool, String> {
    let name = if kind == "batch" {
        format!("new-api-log-stats-{}.csv", Local::now().format("%Y-%m-%d"))
    } else {
        format!("new-api-key-logs-{}.csv", Local::now().format("%Y-%m-%d"))
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(name)
        .add_filter("CSV", &["csv"])
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver.await.map_err(command_error)? else {
        return Ok(false);
    };
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    let mut file = app.fs().open(path, options).map_err(command_error)?;
    file.write_all(content.as_bytes()).map_err(command_error)?;
    file.flush().map_err(command_error)?;
    Ok(true)
}

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Value, String> {
    let endpoint = state.config.read().await.update_feed_url.trim().to_string();
    if endpoint.is_empty() {
        return Ok(serde_json::json!({
            "ok": false,
            "message": "No update feed URL is configured."
        }));
    }
    let endpoint = Url::parse(&endpoint).map_err(|_| "Update feed URL is invalid")?;
    if endpoint.scheme() != "https" {
        return Err("Update feed URL must use HTTPS".into());
    }
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(command_error)?
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(command_error)?;
    match updater.check().await.map_err(command_error)? {
        Some(update) => Ok(serde_json::json!({
            "ok": true,
            "available": true,
            "version": update.version,
            "message": format!("Update available: {}", update.version)
        })),
        None => Ok(serde_json::json!({
            "ok": true,
            "available": false,
            "message": "You are using the latest version."
        })),
    }
}

#[tauri::command]
pub fn reload_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.reload().map_err(command_error)
}

#[tauri::command]
pub fn toggle_devtools(_window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if _window.is_devtools_open() {
            _window.close_devtools();
        } else {
            _window.open_devtools();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_http_urls_and_rejects_other_schemes() {
        assert_eq!(
            normalize_base_url("example.com/path/").unwrap(),
            "https://example.com/path"
        );
        assert!(normalize_base_url("file:///tmp/data").is_err());
    }

    #[test]
    fn secret_mask_does_not_return_full_value() {
        assert_ne!(
            crate::models::mask_secret("sk-abcdefghijklmnop"),
            "sk-abcdefghijklmnop"
        );
    }
}
