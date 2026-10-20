// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the window's updater needs from this side: whether a session might
//! be running, a copy of the saves before the bundled server changes, and
//! the versions Settings → About shows.
//!
//! Checking, downloading and installing are `tauri-plugin-updater`'s; the
//! decisions (offer, wait, back up, refuse a downgrade) are pure functions in
//! `src/lib/state/updates.ts`. The session supervisor outlives the window,
//! so "is a session running" is asked of the server (`status --json`) and
//! read from the data directory's records, not only from this window.

use crate::{cli, data, server};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

/// `status --json` as the server answered it.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StatusProbe {
    /// The state it reported, `none` when no session was ever started.
    Ok {
        state: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct Activity {
    pub cli: StatusProbe,
    pub recorded: data::Recorded,
    /// This window started a session whose front-end is still running.
    pub window_session: bool,
}

fn window_session(state: &State<'_, crate::AppState>) -> bool {
    state
        .session
        .lock()
        .ok()
        .and_then(|mut guard| guard.as_mut().map(cli::RunningSession::is_running))
        .unwrap_or(false)
}

/// The session state in `status --json`: `none` when there is no session.
/// v0.3.0 prints `{"state":"none"}` or the status itself; contract v1
/// prints `{"version":1,"session":<status or null>}`.
pub fn session_state(value: &serde_json::Value) -> Option<&str> {
    match value.get("session") {
        Some(serde_json::Value::Null) => Some("none"),
        Some(session) => session["state"].as_str(),
        None => value["state"].as_str(),
    }
}

fn probe(settings: &crate::settings::Settings) -> StatusProbe {
    match cli::status(settings) {
        Ok(cli::CliResult::Ok { value }) => match session_state(&value) {
            Some(state) => StatusProbe::Ok {
                state: state.to_owned(),
            },
            None => StatusProbe::Error {
                message: "status --json printed no state.".into(),
            },
        },
        Ok(cli::CliResult::Error { message, .. }) => StatusProbe::Error { message },
        Err(message) => StatusProbe::Error { message },
    }
}

#[tauri::command]
pub async fn session_activity(state: State<'_, crate::AppState>) -> Result<Activity, String> {
    let settings = state.settings();
    let window_session = window_session(&state);
    let (cli, recorded) = tauri::async_runtime::spawn_blocking(move || {
        let recorded = match data::data_dir(&settings) {
            Some(dir) => data::recorded_session(&dir),
            None => data::Recorded::None,
        };
        (probe(&settings), recorded)
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(Activity {
        cli,
        recorded,
        window_session,
    })
}

/// Copy the saves aside before an update that changes the bundled server.
/// Refuses while a session runs, whatever the window decided.
#[tauri::command]
pub async fn backup_saves(
    state: State<'_, crate::AppState>,
    from: String,
    to: String,
) -> Result<data::BackupReport, String> {
    if window_session(&state) {
        return Err("A session is running. Saves are copied once it has stopped.".into());
    }
    let settings = state.settings();
    tauri::async_runtime::spawn_blocking(move || {
        if let StatusProbe::Ok { state } = probe(&settings)
            && data::is_live_state(&state)
        {
            return Err("A session is running. Saves are copied once it has stopped.".into());
        }
        let dir = data::data_dir(&settings).ok_or("No data folder is known on this system.")?;
        data::backup_saves(&dir, &from, &to, std::time::SystemTime::now())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdaterInfo {
    pub endpoint: Option<String>,
    /// A public key is configured; builds without one cannot install updates.
    pub configured: bool,
    /// This copy runs from the no-install ZIP: it checks for updates but
    /// cannot install them, so it offers their download page instead.
    pub portable: bool,
}

/// Shipped next to the launcher in the no-install ZIP, never by the
/// installer. Its presence marks a copy that was not installed.
pub const PORTABLE_MARKER: &str = "portable.txt";

/// Whether the launcher in `launcher_dir` is a no-install copy.
pub fn is_portable(launcher_dir: Option<&Path>) -> bool {
    launcher_dir.is_some_and(|dir| dir.join(PORTABLE_MARKER).is_file())
}

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub launcher_version: String,
    pub server: server::ServerInfo,
    pub data_dir: Option<PathBuf>,
    /// The launcher's own folder when it holds the game: it is then the game
    /// folder, and Settings does not offer another.
    pub game_in_launcher_folder: Option<PathBuf>,
    pub updater: UpdaterInfo,
    pub debug_build: bool,
    /// The signed-in Windows user's name, so "Hide my user name" can take it
    /// out of copied paths and summaries.
    pub user_name: Option<String>,
}

/// The current user's name (`USERNAME` on Windows, `USER` elsewhere).
pub fn user_name() -> Option<String> {
    ["USERNAME", "USER"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .map(|name| name.trim().to_owned())
        .find(|name| !name.is_empty())
}

fn updater_info(app: &AppHandle) -> UpdaterInfo {
    let config = app.config().plugins.0.get("updater");
    let endpoint = config
        .and_then(|c| c["endpoints"][0].as_str())
        .map(str::to_owned);
    let configured = config
        .and_then(|c| c["pubkey"].as_str())
        .is_some_and(|key| !key.trim().is_empty());
    let launcher_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    UpdaterInfo {
        endpoint,
        configured,
        portable: is_portable(launcher_dir.as_deref()),
    }
}

#[tauri::command]
pub async fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let launcher_version = app.package_info().version.to_string();
    let updater = updater_info(&app);
    let state = app.state::<crate::AppState>();
    let settings = state.settings();
    let stored = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let folder = state.game_folder(&stored);
    let game_in_launcher_folder = (folder.source == crate::detect::GameSource::LauncherFolder)
        .then_some(folder.path)
        .flatten();
    let (server, data_dir) =
        tauri::async_runtime::spawn_blocking(move || (server::info(), data::data_dir(&settings)))
            .await
            .map_err(|e| e.to_string())?;
    Ok(AppInfo {
        launcher_version,
        server,
        data_dir,
        game_in_launcher_folder,
        updater,
        debug_build: cfg!(debug_assertions),
        user_name: user_name(),
    })
}

#[cfg(test)]
mod tests {
    const CONFIG: &str = include_str!("../tauri.conf.json");
    const WINDOWS: &str = include_str!("../tauri.windows.conf.json");

    fn config() -> serde_json::Value {
        serde_json::from_str(CONFIG).unwrap()
    }

    #[test]
    fn only_a_copy_with_the_marker_beside_it_is_a_no_install_copy() {
        let dir = std::env::temp_dir().join(format!("ah-portable-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!super::is_portable(Some(&dir)), "installed: no marker");
        assert!(!super::is_portable(None));
        std::fs::create_dir_all(dir.join(super::PORTABLE_MARKER)).unwrap();
        assert!(
            !super::is_portable(Some(&dir)),
            "a folder is not the marker"
        );
        std::fs::remove_dir(dir.join(super::PORTABLE_MARKER)).unwrap();
        std::fs::write(dir.join(super::PORTABLE_MARKER), "no-install copy").unwrap();
        assert!(super::is_portable(Some(&dir)));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_marker_ships_only_in_the_zip() {
        // The installer must never carry it: an installed copy would then
        // stop installing updates.
        let windows: serde_json::Value = serde_json::from_str(WINDOWS).unwrap();
        assert!(!windows.to_string().contains(super::PORTABLE_MARKER));
        assert!(!CONFIG.contains(super::PORTABLE_MARKER));
        let marker = include_str!("../../packaging/portable.txt");
        assert!(marker.contains("Afterhours Launcher.exe"));
    }

    #[test]
    fn the_session_state_is_read_from_either_status_shape() {
        use serde_json::json;
        let state = |v: serde_json::Value| super::session_state(&v).map(str::to_owned);
        // v0.3.0
        assert_eq!(state(json!({"state": "none"})).as_deref(), Some("none"));
        assert_eq!(
            state(json!({"version": 1, "id": "a", "state": "ready"})).as_deref(),
            Some("ready")
        );
        // Contract v1
        assert_eq!(
            state(json!({"version": 1, "session": null})).as_deref(),
            Some("none")
        );
        assert_eq!(
            state(json!({"version": 1, "session": {"state": "stopping"}})).as_deref(),
            Some("stopping")
        );
        assert_eq!(state(json!({"version": 1})), None);
    }

    #[test]
    fn the_updater_trusts_the_owners_key() {
        // Installed launchers accept only updates signed with this key
        // (minisign key ID 7C31722E0AB52793, created 2026-10-20). Changing
        // it strands every installed launcher: see RELEASING.md.
        assert_eq!(
            config()["plugins"]["updater"]["pubkey"],
            "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDdDMzE3MjJFMEFCNTI3OTMKUldTVEo3VUtMbkl4ZkQ1ZHhpVllNTlVCQTIrYXdMeDZ0bW00ZUZ6VGk4ZUhLaU1xODhBU0wzN2kK"
        );
    }

    #[test]
    fn the_updater_configuration_is_what_the_plugin_accepts() {
        let updater = config()["plugins"]["updater"].clone();
        // The plugin's own deserializer, as it runs when the app starts.
        let parsed: tauri_plugin_updater::Config = serde_json::from_value(updater).unwrap();
        assert!(parsed.require_signed_version);
        assert!(!parsed.allow_downgrades);
        assert_eq!(
            parsed
                .endpoints
                .iter()
                .map(|u| u.as_str())
                .collect::<Vec<_>>(),
            [
                "https://github.com/afterhours-crew/afterhours-2015-launcher/releases/latest/download/latest.json"
            ]
        );
        assert!(!parsed.dangerous_insecure_transport_protocol);
    }

    #[test]
    fn windows_bundles_a_per_user_installer_with_the_pinned_server() {
        let config = config();
        assert_eq!(config["bundle"]["createUpdaterArtifacts"], true);
        assert_eq!(
            config["bundle"]["windows"]["nsis"]["installMode"],
            "currentUser"
        );
        let windows: serde_json::Value = serde_json::from_str(WINDOWS).unwrap();
        assert_eq!(windows["bundle"]["targets"], serde_json::json!(["nsis"]));
        assert_eq!(
            windows["bundle"]["externalBin"],
            serde_json::json!(["binaries/Afterhours"])
        );
        let pin = crate::pin::Pin::parse(include_str!("../../server-pin.json")).unwrap();
        assert_eq!(
            format!("binaries/{}", pin.executable_stem()),
            windows["bundle"]["externalBin"][0]
        );
    }
}
