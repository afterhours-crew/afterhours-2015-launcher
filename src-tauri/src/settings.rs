// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the window remembers between runs: where the command-line launcher
//! build is, where the game is, where the data directory is, and the driver
//! name. Stored as one JSON file in the app's config directory.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    /// Directory holding `nfs-afterhours` and `nfs-server`, normally the
    /// `target/release` directory of an afterhours-2015 checkout.
    pub cli_dir: Option<PathBuf>,
    /// Installed Need for Speed (2015) directory.
    pub game_dir: Option<PathBuf>,
    /// Launcher data directory; `None` means the CLI's own default.
    pub data_dir: Option<PathBuf>,
    /// Display name for the first account.
    pub player_name: Option<String>,
    /// Avatar color name from the design system's six, shown in the header.
    pub avatar: Option<String>,
    /// The first-run wizard has been completed once.
    pub first_run_done: bool,
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    Ok(dir.join("settings.json"))
}

/// Read settings from disk; a missing or unreadable file yields defaults.
pub fn load(app: &AppHandle) -> Result<Settings, Box<dyn std::error::Error>> {
    let path = file(app)?;
    Ok(read(&path))
}

pub(crate) fn read(path: &Path) -> Settings {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub(crate) fn write(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<'_, crate::AppState>) -> Settings {
    state.settings.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    write(&file(&app)?, &settings)?;
    if let Ok(mut current) = state.settings.lock() {
        *current = settings.clone();
    }
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_and_tolerate_missing_or_broken_files() {
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-settings-{}", std::process::id()));
        let path = dir.join("nested").join("settings.json");
        assert_eq!(read(&path), Settings::default());
        let settings = Settings {
            cli_dir: Some(PathBuf::from("/builds/release")),
            game_dir: Some(PathBuf::from("F:\\EA Games\\Need for Speed")),
            data_dir: None,
            player_name: Some("Driver_01".into()),
            avatar: Some("style".into()),
            first_run_done: true,
        };
        write(&path, &settings).unwrap();
        assert_eq!(read(&path), settings);
        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(read(&path), Settings::default());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
