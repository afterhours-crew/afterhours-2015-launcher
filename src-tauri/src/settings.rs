// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the window remembers between runs: where the game is, where the
//! data directory is, the driver name, how updates are handled and which
//! server version last ran. Stored as one JSON file in the app's config
//! directory. A missing, damaged or unknown file yields defaults.

use crate::detect::{GameFolder, GameSource};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Installed Need for Speed (2015) directory.
    pub game_dir: Option<PathBuf>,
    /// Data directory; `None` means the server's own default
    /// (`%LOCALAPPDATA%\Afterhours2015` on Windows).
    pub data_dir: Option<PathBuf>,
    /// Display name for the first account.
    pub player_name: Option<String>,
    /// Avatar color name from the design system's six, shown in the header.
    pub avatar: Option<String>,
    /// The first-run wizard has been completed once.
    pub first_run_done: bool,
    pub updates: UpdateSettings,
    /// Server tag of the last session this launcher started. A different
    /// bundled tag means an update arrived since, and the first start may
    /// rebuild the content cache.
    pub last_server_tag: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateSettings {
    pub mode: UpdateMode,
    /// A launcher version the user chose to skip in Ask mode.
    pub skipped_version: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateMode {
    /// Check in the background and ask before installing.
    #[default]
    Ask,
    /// Check in the background and install when no session runs.
    Auto,
    /// Only check when asked to.
    Off,
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

/// The settings in use: the game folder is the one `folder` decided
/// ([`detect::game_folder`]), so while the launcher sits in the game folder
/// that folder is used, whatever is saved.
pub fn effective(stored: &Settings, folder: &GameFolder) -> Settings {
    Settings {
        game_dir: folder.path.clone(),
        ..stored.clone()
    }
}

/// What to save from the window's `incoming` settings. While the launcher
/// sits in the game folder the window cannot choose another one, and the
/// saved game folder is kept as it was for when the launcher runs from
/// elsewhere again.
pub fn to_store(incoming: Settings, stored: &Settings, folder: &GameFolder) -> Settings {
    match folder.source {
        GameSource::LauncherFolder => Settings {
            game_dir: stored.game_dir.clone(),
            ..incoming
        },
        GameSource::Settings | GameSource::None => incoming,
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, crate::AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    let mut current = state
        .settings
        .lock()
        .map_err(|_| "settings state poisoned")?;
    let stored = to_store(settings, &current, &state.game_folder(&current));
    write(&file(&app)?, &stored)?;
    *current = stored;
    Ok(effective(&current, &state.game_folder(&current)))
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
            game_dir: Some(PathBuf::from("F:\\EA Games\\Need for Speed")),
            data_dir: None,
            player_name: Some("Driver_01".into()),
            avatar: Some("style".into()),
            first_run_done: true,
            updates: UpdateSettings {
                mode: UpdateMode::Auto,
                skipped_version: Some("0.2.0".into()),
            },
            last_server_tag: Some("v0.3.0".into()),
        };
        write(&path, &settings).unwrap();
        assert_eq!(read(&path), settings);
        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(read(&path), Settings::default());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_launcher_folder_is_the_game_folder_in_use_but_never_saved() {
        let launcher = Path::new("G:/Need for Speed");
        let stored = Settings {
            game_dir: Some(PathBuf::from("F:/EA Games/Need for Speed")),
            player_name: Some("Driver".into()),
            ..Settings::default()
        };
        let nfs16 = launcher.join(crate::detect::GAME_EXECUTABLE);
        let in_game =
            crate::detect::game_folder(Some(launcher), stored.game_dir.as_deref(), |p: &Path| {
                p == nfs16
            });
        let elsewhere = crate::detect::game_folder(
            Some(Path::new("C:/Programs/Afterhours")),
            stored.game_dir.as_deref(),
            |p: &Path| p == nfs16,
        );

        // In use: the launcher's folder, whatever is saved.
        let used = effective(&stored, &in_game);
        assert_eq!(used.game_dir.as_deref(), Some(launcher));
        assert_eq!(used.player_name, stored.player_name);
        // Elsewhere: the saved folder.
        assert_eq!(effective(&stored, &elsewhere), stored);

        // Saving from the window keeps the saved game folder while the
        // launcher is in a game folder, and takes everything else.
        let incoming = Settings {
            game_dir: Some(launcher.to_path_buf()),
            player_name: Some("Nova".into()),
            ..stored.clone()
        };
        let saved = to_store(incoming.clone(), &stored, &in_game);
        assert_eq!(saved.game_dir, stored.game_dir);
        assert_eq!(saved.player_name.as_deref(), Some("Nova"));
        assert_eq!(to_store(incoming.clone(), &stored, &elsewhere), incoming);
    }

    #[test]
    fn partial_files_fill_in_defaults_and_ask_is_the_default_mode() {
        let parsed: Settings = serde_json::from_str(r#"{"player_name":"Nova"}"#).unwrap();
        assert_eq!(parsed.player_name.as_deref(), Some("Nova"));
        assert_eq!(parsed.updates.mode, UpdateMode::Ask);
        let json = serde_json::to_value(UpdateSettings::default()).unwrap();
        assert_eq!(json["mode"], "ask");
        let off: UpdateSettings = serde_json::from_str(r#"{"mode":"off"}"#).unwrap();
        assert_eq!(off.mode, UpdateMode::Off);
    }
}
