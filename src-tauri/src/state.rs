#[cfg(desktop)]
use std::sync::atomic::AtomicBool;
use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use reqwest::Client;
use serde_json::Value;
use sqlx::MySqlPool;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use crate::{
    models::{BackendStatus, DesktopConfig, KeyBatchProfile, KeyQueryProfile},
    storage::Storage,
};

pub struct AppState {
    pub app: AppHandle,
    pub storage: Storage,
    pub config: RwLock<DesktopConfig>,
    pub status: RwLock<BackendStatus>,
    pub key_query_profiles: RwLock<Vec<KeyQueryProfile>>,
    pub key_batch_profiles: RwLock<Vec<KeyBatchProfile>>,
    pub mysql_pool: RwLock<Option<MySqlPool>>,
    pub cookie_jars: RwLock<HashMap<String, HashMap<String, String>>>,
    pub frontend_storage: RwLock<Value>,
    pub asset_aliases: HashMap<String, String>,
    pub http: Client,
    pub servers: RwLock<HashMap<String, JoinHandle<()>>>,
    #[cfg(desktop)]
    pub window_save_tasks: RwLock<HashMap<String, JoinHandle<()>>>,
    #[cfg(desktop)]
    pub is_exiting: AtomicBool,
}

impl AppState {
    pub fn load(app: AppHandle) -> Result<Arc<Self>> {
        let storage = Storage::new(&app)?;
        let mut config = storage.load_config();
        config
            .instances
            .retain(|instance| !instance.id.is_empty() && !instance.base_url.is_empty());
        if config.active_instance_id.is_empty() {
            config.active_instance_id = config
                .instances
                .first()
                .map(|instance| instance.id.clone())
                .unwrap_or_default();
        }
        let key_query_profiles = storage.load_key_query_profiles();
        let frontend_storage = storage.load_frontend_storage();
        let cookie_jars = storage.load_backend_cookies();
        let mut key_batch_profiles = storage.load_key_batch_profiles();
        key_batch_profiles.sort_by(|a, b| a.name.cmp(&b.name));
        let asset_aliases = app
            .asset_resolver()
            .get("asset-aliases.json".into())
            .and_then(|asset| serde_json::from_slice::<serde_json::Value>(&asset.bytes).ok())
            .and_then(|value| value.get("aliases").cloned())
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        let http = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(15))
            .timeout(std::time::Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("New-API-Desktop/1.1.6")
            .build()?;
        Ok(Arc::new(Self {
            app,
            storage,
            config: RwLock::new(config),
            status: RwLock::new(BackendStatus::default()),
            key_query_profiles: RwLock::new(key_query_profiles),
            key_batch_profiles: RwLock::new(key_batch_profiles),
            mysql_pool: RwLock::new(None),
            cookie_jars: RwLock::new(cookie_jars),
            frontend_storage: RwLock::new(frontend_storage),
            asset_aliases,
            http,
            servers: RwLock::new(HashMap::new()),
            #[cfg(desktop)]
            window_save_tasks: RwLock::new(HashMap::new()),
            #[cfg(desktop)]
            is_exiting: AtomicBool::new(false),
        }))
    }
}
