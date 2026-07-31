use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWindowState {
    #[serde(default)]
    pub label: String,
    pub instance_id: String,
    pub flavor: String,
    #[serde(default)]
    pub bounds: WindowBounds,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub auth_mode: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default = "default_flavor")]
    pub flavor: String,
    #[serde(default)]
    pub user: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicInstance {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub auth_mode: String,
    pub access_token: String,
    pub has_access_token: bool,
    pub user_id: String,
    pub flavor: String,
    pub user: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<&Instance> for PublicInstance {
    fn from(value: &Instance) -> Self {
        Self {
            id: value.id.clone(),
            name: value.name.clone(),
            base_url: value.base_url.clone(),
            auth_mode: value.auth_mode.clone(),
            access_token: mask_secret(&value.access_token),
            has_access_token: !value.access_token.is_empty(),
            user_id: value.user_id.clone(),
            flavor: value.flavor.clone(),
            user: value.user.clone(),
            created_at: value.created_at.clone(),
            updated_at: value.updated_at.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    #[serde(default)]
    pub instances: Vec<Instance>,
    #[serde(default)]
    pub active_instance_id: String,
    #[serde(default = "default_flavor")]
    pub active_flavor: String,
    #[serde(default = "default_language")]
    pub desktop_language: String,
    #[serde(default)]
    pub update_feed_url: String,
    #[serde(default)]
    pub open_windows: Vec<OpenWindowState>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            instances: Vec::new(),
            active_instance_id: String::new(),
            active_flavor: default_flavor(),
            desktop_language: default_language(),
            update_feed_url: String::new(),
            open_windows: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub ok: bool,
    pub message: String,
    pub checked_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub instances: Vec<PublicInstance>,
    pub active_instance_id: String,
    pub active_flavor: String,
    pub desktop_language: String,
    pub update_feed_url: String,
    pub open_windows: Vec<OpenWindowState>,
    pub active_instance: Option<PublicInstance>,
    pub desktop_url: String,
    pub app_locale: String,
    pub status: BackendStatus,
    pub mobile: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceInput {
    pub id: Option<String>,
    pub name: Option<String>,
    pub base_url: String,
    pub auth_mode: Option<String>,
    pub access_token: Option<String>,
    pub user_id: Option<String>,
    pub flavor: Option<String>,
    pub user: Option<Value>,
    pub created_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyQueryProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBatchProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default)]
    pub password: String,
    pub database: String,
    #[serde(default = "default_mysql_tls_mode")]
    pub tls_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicKeyBatchProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub has_password: bool,
    pub database: String,
    pub tls_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<&KeyBatchProfile> for PublicKeyBatchProfile {
    fn from(value: &KeyBatchProfile) -> Self {
        Self {
            id: value.id.clone(),
            name: value.name.clone(),
            host: value.host.clone(),
            port: value.port,
            user: value.user.clone(),
            password: String::new(),
            has_password: !value.password.is_empty(),
            database: value.database.clone(),
            tls_mode: value.tls_mode.clone(),
            created_at: value.created_at.clone(),
            updated_at: value.updated_at.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyQueryInput {
    pub base_url: String,
    pub api_key: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBatchProfileInput {
    pub id: Option<String>,
    pub name: Option<String>,
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub password: Option<String>,
    pub database: String,
    pub tls_mode: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyQueryLog {
    pub created_at: i64,
    pub token_name: String,
    pub group: String,
    pub model_name: String,
    pub use_time: f64,
    pub is_stream: bool,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub quota: i64,
    pub model_ratio: f64,
    pub group_ratio: f64,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyQueryResult {
    pub server: String,
    pub token_name: String,
    pub balance: f64,
    pub usage: f64,
    pub access_until: i64,
    pub logs: Vec<KeyQueryLog>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationInput {
    pub mode: String,
    pub group: String,
    #[serde(default)]
    pub days: f64,
    #[serde(default)]
    pub hours: f64,
    #[serde(default)]
    pub minutes: f64,
    #[serde(default)]
    pub dollars: f64,
    #[serde(default)]
    pub used_only: bool,
    #[serde(default)]
    pub min_enabled: bool,
    #[serde(default)]
    pub min_usd: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub affected_rows: u64,
    pub label: String,
    pub group: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsInput {
    pub start: i64,
    pub end: i64,
    #[serde(default = "default_top")]
    pub top: u32,
    #[serde(default)]
    pub group_by: String,
    #[serde(default)]
    pub sort_by: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_min_tokens")]
    pub min_tokens: i64,
    pub exclude_user_id: Option<Value>,
    pub user_id: Option<Value>,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StatsRow {
    pub name: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub quota: i64,
    pub unique_users: i64,
}

pub fn mask_secret(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.is_empty() {
        String::new()
    } else if chars.len() <= 10 {
        "********".into()
    } else {
        format!(
            "{}...{}",
            chars[..5].iter().collect::<String>(),
            chars[chars.len() - 4..].iter().collect::<String>()
        )
    }
}

pub fn default_flavor() -> String {
    "default".into()
}

fn default_language() -> String {
    "auto".into()
}

fn default_mysql_tls_mode() -> String {
    "preferred".into()
}

fn default_top() -> u32 {
    10
}

fn default_min_tokens() -> i64 {
    1
}
