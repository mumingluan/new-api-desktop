use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

use crate::models::{DesktopConfig, KeyBatchProfile, KeyQueryProfile};

#[derive(Debug)]
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(app: &AppHandle) -> Result<Self> {
        #[cfg(desktop)]
        let root = app
            .path()
            .config_dir()
            .context("cannot resolve config directory")?
            .join("new-api-desktop");
        #[cfg(mobile)]
        let root = app
            .path()
            .app_data_dir()
            .context("cannot resolve app data directory")?;
        fs::create_dir_all(&root).with_context(|| format!("cannot create {}", root.display()))?;
        Ok(Self { root })
    }

    pub fn load_config(&self) -> DesktopConfig {
        self.read_json("desktop-config.json").unwrap_or_default()
    }

    pub fn save_config(&self, value: &DesktopConfig) -> Result<()> {
        self.write_json("desktop-config.json", value)
    }

    pub fn load_key_query_profiles(&self) -> Vec<KeyQueryProfile> {
        self.read_profiles("key-query-profiles.json")
    }

    pub fn save_key_query_profiles(&self, profiles: &[KeyQueryProfile]) -> Result<()> {
        self.write_json(
            "key-query-profiles.json",
            &serde_json::json!({ "version": 1, "profiles": profiles }),
        )
    }

    pub fn load_key_batch_profiles(&self) -> Vec<KeyBatchProfile> {
        self.read_profiles("key-batch-profiles.json")
    }

    pub fn save_key_batch_profiles(&self, profiles: &[KeyBatchProfile]) -> Result<()> {
        self.write_json(
            "key-batch-profiles.json",
            &serde_json::json!({ "version": 1, "profiles": profiles }),
        )
    }

    pub fn load_frontend_storage(&self) -> serde_json::Value {
        self.read_json("frontend-storage.json")
            .unwrap_or_else(|_| serde_json::json!({ "version": 1, "instances": {} }))
    }

    pub fn save_frontend_storage(&self, value: &serde_json::Value) -> Result<()> {
        self.write_json("frontend-storage.json", value)
    }

    pub fn load_backend_cookies(&self) -> HashMap<String, HashMap<String, String>> {
        self.read_json("backend-cookies.json").unwrap_or_default()
    }

    pub fn save_backend_cookies(
        &self,
        value: &HashMap<String, HashMap<String, String>>,
    ) -> Result<()> {
        self.write_json("backend-cookies.json", value)
    }

    fn read_profiles<T: DeserializeOwned>(&self, name: &str) -> Vec<T> {
        let value: serde_json::Value = match self.read_json(name) {
            Ok(value) => value,
            Err(_) => return Vec::new(),
        };
        let profiles = value
            .get("profiles")
            .cloned()
            .unwrap_or_else(|| value.clone());
        serde_json::from_value(profiles).unwrap_or_default()
    }

    fn read_json<T: DeserializeOwned>(&self, name: &str) -> Result<T> {
        let path = self.root.join(name);
        let data = fs::read(&path).with_context(|| format!("cannot read {}", path.display()))?;
        serde_json::from_slice(&data).with_context(|| format!("invalid JSON in {}", path.display()))
    }

    fn write_json<T: Serialize + ?Sized>(&self, name: &str, value: &T) -> Result<()> {
        let path = self.root.join(name);
        let temporary = self.root.join(format!(".{name}.tmp"));
        let data = serde_json::to_vec_pretty(value)?;
        fs::write(&temporary, data)
            .with_context(|| format!("cannot write {}", temporary.display()))?;
        restrict_file_permissions(&temporary)?;
        if path.exists() {
            fs::remove_file(&path).with_context(|| format!("cannot replace {}", path.display()))?;
        }
        fs::rename(&temporary, &path)
            .with_context(|| format!("cannot commit {}", path.display()))?;
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}
