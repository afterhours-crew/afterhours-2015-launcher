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
    /// Explicit opt-in to sharing basic local activity with the Discord client.
    pub discord_presence: bool,
    /// Server tag of the last session this launcher started. A different
    /// bundled tag means an update arrived since, and the first start may
    /// rebuild the content cache.
    pub last_server_tag: Option<String>,
    /// Your server on another PC on your network, reached through its API;
    /// `None` is this PC's own server, which the launcher starts and stops.
    pub server: Option<RemoteServer>,
    /// This PC's own server's API, as the launcher starts it: the port and
    /// token it chooses, so it reaches its own server by address and token
    /// exactly as it reaches one on another PC. Created the first time it
    /// starts a server with the API.
    pub local_api: Option<LocalApi>,
    /// This PC's network address when your other PCs may use this server:
    /// the launcher then starts it with `--server-only --listen <address>`.
    /// `None` keeps it on this PC only.
    pub share_address: Option<std::net::Ipv4Addr>,
    /// How many times the window has opened, for the Garage's occasional
    /// support line (src/lib/state/support.ts decides when).
    pub launches: u32,
    /// When the Garage last showed the support line, UTC; `None` never.
    pub support_shown_utc: Option<String>,
}

/// This PC's IPv4 address on its network: the source a UDP socket would
/// use toward a documentation address (connecting one sends nothing).
pub fn this_pc_address() -> Option<std::net::Ipv4Addr> {
    let socket = std::net::UdpSocket::bind(("0.0.0.0", 0)).ok()?;
    socket.connect(("192.0.2.1", 9)).ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

/// Let your other PCs use this PC's server, or keep it on this PC only.
/// Takes effect when the server next starts; refused while it runs.
#[tauri::command]
pub fn set_sharing(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    enabled: bool,
) -> Result<Settings, String> {
    if state.window_session_runs() {
        return Err("Stop your server first; sharing changes when it starts.".into());
    }
    let share_address = if enabled {
        Some(this_pc_address().ok_or("This PC has no network address to share on.")?)
    } else {
        None
    };
    let mut current = state
        .settings
        .lock()
        .map_err(|_| "settings state poisoned")?;
    let next = Settings {
        share_address,
        ..current.clone()
    };
    write(&file(&app)?, &next)?;
    *current = next;
    Ok(effective(&current, &state.game_folder(&current)))
}

/// The API address and token the launcher gives its own server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalApi {
    pub port: u16,
    /// 64 lowercase hexadecimal characters from the system's random source.
    pub token: String,
}

impl LocalApi {
    /// A free loopback port and a new token.
    pub fn new() -> Result<Self, String> {
        let port = std::net::TcpListener::bind(("127.0.0.1", 0))
            .and_then(|listener| listener.local_addr())
            .map_err(|e| format!("No free port for your server's API: {e}"))?
            .port();
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes)
            .map_err(|e| format!("No random source for your server's token: {e}"))?;
        Ok(Self {
            port,
            token: bytes.iter().map(|b| format!("{b:02x}")).collect(),
        })
    }
}

/// This PC's own server's API, created and saved on first use.
pub fn ensure_local_api(app: &AppHandle, state: &crate::AppState) -> Result<LocalApi, String> {
    let mut current = state
        .settings
        .lock()
        .map_err(|_| "settings state poisoned")?;
    if let Some(api) = &current.local_api {
        return Ok(api.clone());
    }
    let api = LocalApi::new()?;
    let next = Settings {
        local_api: Some(api.clone()),
        ..current.clone()
    };
    write(&file(app)?, &next)?;
    *current = next;
    Ok(api)
}

/// A server on another PC: what its `api --json` prints there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteServer {
    /// `http://<IPv4 address>:<port>`, started there with `serve
    /// --server-only --api --listen <address> --api-port <port>`.
    pub url: String,
    /// Its API token: 64 lowercase hexadecimal characters.
    pub token: String,
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
    Ok(for_distribution(
        read(&path),
        &app.config().identifier,
        &app.path().app_local_data_dir()?,
    ))
}

/// A preview installation has its own Tauri identifier and server data. Never
/// fall back to the production server directory when its settings are absent.
fn for_distribution(mut settings: Settings, identifier: &str, local_data: &Path) -> Settings {
    if identifier == "crew.afterhours.launcher.prologue-preview" {
        settings
            .data_dir
            .get_or_insert_with(|| local_data.join("server"));
        settings.updates.mode = UpdateMode::Off;
    }
    settings
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
    // The window never chooses this PC's API; keep the launcher's own.
    let settings = Settings {
        local_api: current.local_api.clone(),
        ..settings
    };
    let stored = for_distribution(
        to_store(settings, &current, &state.game_folder(&current)),
        &app.config().identifier,
        &app.path().app_local_data_dir().map_err(|e| e.to_string())?,
    );
    write(&file(&app)?, &stored)?;
    *current = stored;
    let saved = effective(&current, &state.game_folder(&current));
    state.discord.configure(&saved);
    // A new data folder brings its own pictures folder.
    crate::images::allow(&app, &saved);
    Ok(saved)
}

/// Use the server on another PC at `server` (checked first: its API must
/// answer with that token), or this PC's own server again with `None`.
/// Refused while this window's own session runs.
#[tauri::command]
pub async fn set_server(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    server: Option<RemoteServer>,
) -> Result<Settings, String> {
    if state.window_session_runs() {
        return Err("Stop your server on this PC first.".into());
    }
    if let Some(remote) = &server {
        let endpoint = crate::connection::Endpoint::remote(remote)?;
        let info =
            tauri::async_runtime::spawn_blocking(move || endpoint.request("GET", "/v1/info"))
                .await
                .map_err(|e| e.to_string())??;
        if info.status != 200 {
            return Err(info.message());
        }
    }
    write_server(&app, &state, server)
}

/// Save which server the window reaches (`None`: this PC's own) and follow
/// it from now on, without checking it; the Server screen checks first.
pub fn write_server(
    app: &AppHandle,
    state: &crate::AppState,
    server: Option<RemoteServer>,
) -> Result<Settings, String> {
    let saved = {
        let mut current = state
            .settings
            .lock()
            .map_err(|_| "settings state poisoned")?;
        let next = Settings {
            server,
            ..current.clone()
        };
        write(&file(app)?, &next)?;
        *current = next;
        effective(&current, &state.game_folder(&current))
    };
    // Follow the chosen server from now on.
    if let Ok(mut connection) = state.connection.lock() {
        *connection = None;
    }
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_is_fresh_and_isolated_while_normal_defaults_and_choices_survive() {
        let base = Path::new("preview-local-data");
        let preview = for_distribution(
            Settings::default(),
            "crew.afterhours.launcher.prologue-preview",
            base,
        );
        assert_eq!(preview.data_dir, Some(base.join("server")));
        assert_eq!(preview.updates.mode, UpdateMode::Off);
        assert!(!preview.first_run_done);
        assert!(
            preview.game_dir.is_none() && preview.local_api.is_none() && preview.server.is_none()
        );
        assert_eq!(
            for_distribution(Settings::default(), "crew.afterhours.launcher", base),
            Settings::default()
        );
        let chosen = Settings {
            data_dir: Some(PathBuf::from("chosen-preview-save")),
            first_run_done: true,
            ..Settings::default()
        };
        let reopened = for_distribution(
            chosen.clone(),
            "crew.afterhours.launcher.prologue-preview",
            base,
        );
        assert_eq!(reopened.data_dir, chosen.data_dir);
        assert!(reopened.first_run_done);
    }

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
            discord_presence: true,
            updates: UpdateSettings {
                mode: UpdateMode::Auto,
                skipped_version: Some("0.2.0".into()),
            },
            last_server_tag: Some("v0.3.0".into()),
            server: Some(RemoteServer {
                url: "http://192.168.1.20:61000".into(),
                token: "a".repeat(64),
            }),
            local_api: Some(LocalApi::new().unwrap()),
            share_address: Some([192, 168, 1, 20].into()),
            launches: 12,
            support_shown_utc: Some("2026-10-23T08:00:00Z".into()),
        };
        write(&path, &settings).unwrap();
        assert_eq!(read(&path), settings);
        // Files from before this setting use this PC's own server.
        std::fs::write(&path, br#"{"first_run_done": true}"#).unwrap();
        assert_eq!(read(&path).server, None);
        assert!(!read(&path).discord_presence);
        assert_eq!(read(&path).local_api, None);
        assert_eq!(read(&path).share_address, None);
        let a = LocalApi::new().unwrap();
        let b = LocalApi::new().unwrap();
        assert!(a.port != 0 && a.token.len() == 64 && a.token != b.token);
        assert!(
            a.token
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        );
        // Files from before the support line count from zero.
        std::fs::write(&path, br#"{"first_run_done": true}"#).unwrap();
        assert_eq!(read(&path).launches, 0);
        assert_eq!(read(&path).support_shown_utc, None);
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
