// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The read-only server commands behind Profile, Cars, Save data and Logs,
//! and the session files the log viewer shows.
//!
//! `profile`, `profile --list` and `sessions` are the server's own
//! read-only commands (contract v1). The window asks for them only when the
//! server reports the `profile` or `sessions` capability, and they run like
//! `status`: with `--json`, within a deadline, their one object returned.
//! While the window follows a session's API, the selected save's profile
//! comes from its `GET /v1/profile` instead, the same record.
//!
//! The log viewer opens one file of one session folder by name: the server
//! names the session folders and their files in `sessions --json`, and this
//! module reads only those names, never a path the window sends. Links are
//! not followed, and a file is read up to the server's own log bound.

use crate::{cli, data, server, settings::Settings};
use serde::Serialize;
use std::{
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

/// `profile` reads one SQLite save, `sessions` scans the session logs.
pub const READ_TIMEOUT: Duration = Duration::from_secs(30);

/// The server stops writing a session log at 4 MiB.
pub const MAX_SESSION_FILE_BYTES: u64 = 4 * 1024 * 1024;

/// Files a session folder may hold that the window shows. The server
/// writes each child's output to `<child>.stdout.*` and `<child>.stderr.log`;
/// `stop` and `stop-server` are the stop requests a Stop leaves behind.
pub const SESSION_FILES: [&str; 12] = [
    "status.json",
    "request.json",
    "stop",
    "stop-server",
    "prepare.stdout.json",
    "prepare.stderr.log",
    "create-account.stdout.json",
    "create-account.stderr.log",
    "server.stdout.jsonl",
    "server.stderr.log",
    "game.stdout.log",
    "game.stderr.log",
];

/// Account IDs name `artifacts/account/<id>.sqlite`. Only ASCII letters,
/// digits, `-` and `_` are passed on, and never a leading `-`, so the
/// value can never read as an option.
pub fn is_account_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && !text.starts_with('-')
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Session IDs are 32 lowercase hexadecimal characters.
pub fn is_session_id(text: &str) -> bool {
    text.len() == 32
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Arguments for `profile`: the active save, or the named one.
pub fn profile_args(settings: &Settings, account_id: Option<&str>) -> Result<Vec<String>, String> {
    let mut args = cli::global_args(settings);
    args.push("profile".into());
    if let Some(id) = account_id {
        if !is_account_id(id) {
            return Err(format!("{id} is not an account ID."));
        }
        args.push("--account-id".into());
        args.push(id.to_owned());
    }
    Ok(args)
}

/// Arguments for `profile --list`.
pub fn profile_list_args(settings: &Settings) -> Vec<String> {
    let mut args = cli::global_args(settings);
    args.extend(["profile".into(), "--list".into()]);
    args
}

/// Arguments for `sessions`, newest first up to the server's default count.
pub fn sessions_args(settings: &Settings) -> Vec<String> {
    let mut args = cli::global_args(settings);
    args.push("sessions".into());
    args
}

/// One session file as the log viewer shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SessionFileText {
    pub name: String,
    /// The file's size on disk.
    pub bytes: u64,
    /// The first [`MAX_SESSION_FILE_BYTES`] as text; invalid UTF-8 is replaced.
    pub text: String,
    /// The file was larger than what was read.
    pub truncated: bool,
}

fn ordinary_dir(path: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => Ok(()),
        Ok(_) => Err(format!("{} is not an ordinary folder.", path.display())),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// The folder of session `id`, every component below the data folder an
/// ordinary directory rather than a link.
pub fn session_folder(data: &Path, id: &str) -> Result<PathBuf, String> {
    if !is_session_id(id) {
        return Err(format!("{id} is not a session ID."));
    }
    let artifacts = data.join("artifacts");
    let launcher = artifacts.join("launcher");
    let folder = data::session_dir(data, id);
    for dir in [&artifacts, &launcher, &folder] {
        ordinary_dir(dir)?;
    }
    Ok(folder)
}

/// Read `name` from session `id`, bounded and without following links.
pub fn read_session_file(data: &Path, id: &str, name: &str) -> Result<SessionFileText, String> {
    if !SESSION_FILES.contains(&name) {
        return Err(format!("{name} is not a session file the launcher shows."));
    }
    let path = session_folder(data, id)?.join(name);
    let meta = std::fs::symlink_metadata(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("{} is not an ordinary file.", path.display()));
    }
    let file = std::fs::File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut kept = Vec::new();
    file.take(MAX_SESSION_FILE_BYTES + 1)
        .read_to_end(&mut kept)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let truncated = kept.len() as u64 > MAX_SESSION_FILE_BYTES;
    kept.truncate(MAX_SESSION_FILE_BYTES as usize);
    Ok(SessionFileText {
        name: name.to_owned(),
        bytes: meta.len(),
        text: String::from_utf8_lossy(&kept).into_owned(),
        truncated,
    })
}

pub(crate) fn settings_of(state: &State<'_, crate::AppState>) -> Settings {
    state.settings()
}

/// Most bytes kept from one record the server answers.
const MAX_RECORD: usize = 4 * 1024 * 1024;
/// A session file's record holds up to the 4 MiB log bound as JSON text.
const MAX_FILE_RECORD: usize = 12 * 1024 * 1024;

/// One read through the server's API; an unreachable server says so.
async fn api_read(
    endpoint: crate::connection::Endpoint,
    path: String,
    max: usize,
) -> Result<cli::CliResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        endpoint
            .read(&path, READ_TIMEOUT, max)
            .ok_or_else(|| "Your server is not running.".to_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The window's view of the server's `session-file` record.
pub fn session_file_text(value: &serde_json::Value) -> Result<SessionFileText, String> {
    let malformed = || "The server's session-file record is malformed.".to_owned();
    Ok(SessionFileText {
        name: value["name"].as_str().ok_or_else(malformed)?.to_owned(),
        bytes: value["bytes"].as_u64().ok_or_else(malformed)?,
        text: value["text"].as_str().ok_or_else(malformed)?.to_owned(),
        truncated: value["truncated"].as_bool().ok_or_else(malformed)?,
    })
}

async fn run_read(args: Vec<String>) -> Result<cli::CliResult, String> {
    let server = server::current()?;
    tauri::async_runtime::spawn_blocking(move || cli::run_json(&server.path, &args, READ_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
}

/// Story belongs to the selected server, including when it is another PC.
/// Never substitute this PC's save when that server cannot answer.
#[tauri::command]
pub async fn story(state: State<'_, crate::AppState>) -> Result<cli::CliResult, String> {
    match story_source(&settings_of(&state))? {
        StorySource::Remote(endpoint) => api_read(endpoint, "/v1/story".into(), MAX_RECORD).await,
        StorySource::Local(args) => run_read(args).await,
    }
}

enum StorySource {
    Local(Vec<String>),
    Remote(crate::connection::Endpoint),
}

fn story_source(settings: &Settings) -> Result<StorySource, String> {
    if let Some(remote) = settings.server.as_ref() {
        return crate::connection::Endpoint::remote(remote).map(StorySource::Remote);
    }
    // The local command reads the selected save and actual writer/session locks,
    // including while the server runs. A remembered API address is not evidence
    // that its process still exists, and story edits must work after it exits.
    let mut args = cli::global_args(settings);
    args.push("story".into());
    Ok(StorySource::Local(args))
}

/// Saved profiles on this PC are read from the selected data folder, even
/// when a previously used local API address remains in settings. A remote
/// selection always remains remote and never falls back to this PC's save.
fn profile_source(
    settings: &Settings,
    account_id: Option<&str>,
    list: bool,
) -> Result<StorySource, String> {
    let args = if list {
        profile_list_args(settings)
    } else {
        profile_args(settings, account_id)?
    };
    if let Some(remote) = &settings.server {
        return crate::connection::Endpoint::remote(remote).map(StorySource::Remote);
    }
    Ok(StorySource::Local(args))
}

#[tauri::command]
pub async fn profile(
    state: State<'_, crate::AppState>,
    account_id: Option<String>,
) -> Result<cli::CliResult, String> {
    match profile_source(&settings_of(&state), account_id.as_deref(), false)? {
        StorySource::Local(args) => run_read(args).await,
        StorySource::Remote(endpoint) => {
            let path =
                account_id.map_or_else(|| "/v1/profile".into(), |id| format!("/v1/profiles/{id}"));
            api_read(endpoint, path, MAX_RECORD).await
        }
    }
}

/// `profile --list --json` follows the same selected-save boundary.
#[tauri::command]
pub async fn profile_list(state: State<'_, crate::AppState>) -> Result<cli::CliResult, String> {
    match profile_source(&settings_of(&state), None, true)? {
        StorySource::Local(args) => run_read(args).await,
        StorySource::Remote(endpoint) => {
            api_read(endpoint, "/v1/profiles".into(), MAX_RECORD).await
        }
    }
}

/// `sessions --json`.
#[tauri::command]
pub async fn sessions(state: State<'_, crate::AppState>) -> Result<cli::CliResult, String> {
    if let Some(endpoint) = state.server_endpoint() {
        return api_read(endpoint, "/v1/sessions".into(), MAX_RECORD).await;
    }
    run_read(sessions_args(&settings_of(&state))).await
}

/// One file of one session folder, for the log viewer.
#[tauri::command]
pub async fn session_file(
    state: State<'_, crate::AppState>,
    id: String,
    name: String,
) -> Result<SessionFileText, String> {
    if let Some(endpoint) = state.server_endpoint() {
        if !is_session_id(&id) {
            return Err("Not a session ID.".into());
        }
        let path = format!("/v1/sessions/{id}/files/{name}");
        return match api_read(endpoint, path, MAX_FILE_RECORD).await? {
            cli::CliResult::Ok { value } => session_file_text(&value),
            cli::CliResult::Error { message, .. } => Err(message),
        };
    }
    let data =
        data::data_dir(&settings_of(&state)).ok_or("No data folder is known on this system.")?;
    tauri::async_runtime::spawn_blocking(move || read_session_file(&data, &id, &name))
        .await
        .map_err(|e| e.to_string())?
}

/// Open the folder of session `id`.
#[tauri::command]
pub fn open_session_folder(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<(), String> {
    let data =
        data::data_dir(&settings_of(&state)).ok_or("No data folder is known on this system.")?;
    let folder = session_folder(&data, &id)?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopped_local_api_does_not_hide_the_selected_story_save() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/selected-save")),
            local_api: Some(crate::settings::LocalApi {
                port: 1,
                token: "a".repeat(64),
            }),
            ..Settings::default()
        };
        let StorySource::Local(args) = story_source(&settings).unwrap() else {
            panic!("a saved local API must not require a running server");
        };
        assert_eq!(args, ["--json", "--data-dir", "D:/selected-save", "story"]);
    }

    #[test]
    fn remote_story_never_falls_back_to_the_local_save() {
        let mut settings = Settings {
            server: Some(crate::settings::RemoteServer {
                url: "http://192.0.2.1:32123".into(),
                token: "a".repeat(64),
            }),
            data_dir: Some(PathBuf::from("D:/unrelated-save")),
            ..Settings::default()
        };
        assert!(matches!(
            story_source(&settings),
            Ok(StorySource::Remote(_))
        ));
        settings.server.as_mut().unwrap().url = "invalid".into();
        assert!(story_source(&settings).is_err());
    }

    #[test]
    fn remembered_local_api_cannot_intercept_profile_or_save_list_refresh() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/selected-save")),
            local_api: Some(crate::settings::LocalApi {
                port: 1,
                token: "a".repeat(64),
            }),
            ..Settings::default()
        };
        for (account, list, expected) in [
            (None, false, profile_args(&settings, None).unwrap()),
            (Some(ID), false, profile_args(&settings, Some(ID)).unwrap()),
            (None, true, profile_list_args(&settings)),
        ] {
            let StorySource::Local(args) = profile_source(&settings, account, list).unwrap() else {
                panic!("saved profiles must remain readable when the local server has stopped");
            };
            assert_eq!(args, expected);
        }
    }

    #[test]
    fn remote_profiles_and_save_list_never_substitute_local_data() {
        let mut settings = Settings {
            server: Some(crate::settings::RemoteServer {
                url: "http://192.0.2.1:32123".into(),
                token: "a".repeat(64),
            }),
            ..Settings::default()
        };
        for list in [false, true] {
            assert!(matches!(
                profile_source(&settings, None, list),
                Ok(StorySource::Remote(_))
            ));
        }
        settings.server.as_mut().unwrap().url = "invalid".into();
        assert!(profile_source(&settings, None, false).is_err());
        assert!(profile_source(&settings, None, true).is_err());
    }

    const ID: &str = "0123456789abcdef0123456789abcdef";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "afterhours-gui-reads-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn session(data: &Path) -> PathBuf {
        let dir = data::session_dir(data, ID);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn account_ids_cannot_become_options() {
        assert!(is_account_id("1a01140e9c2b4f31a2c7d0e5f6a7b8c9"));
        assert!(is_account_id("tester_2"));
        for bad in [
            "",
            "-x",
            "--data-dir",
            "a b",
            "a/b",
            "..",
            "a\\b",
            &"a".repeat(65),
        ] {
            assert!(!is_account_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn session_ids_are_lowercase_hex() {
        assert!(is_session_id(ID));
        for bad in [
            "",
            "0123456789ABCDEF0123456789ABCDEF",
            "0123456789abcdef0123456789abcde",
            "../../../../../../../../../../xy",
            "0123456789abcdef0123456789abcdeg",
        ] {
            assert!(!is_session_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn profile_arguments_name_the_account_after_the_command() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/data")),
            ..Settings::default()
        };
        assert_eq!(
            profile_args(&settings, None).unwrap(),
            ["--json", "--data-dir", "D:/data", "profile"]
        );
        assert_eq!(
            profile_args(&settings, Some("abc")).unwrap(),
            [
                "--json",
                "--data-dir",
                "D:/data",
                "profile",
                "--account-id",
                "abc"
            ]
        );
        assert!(profile_args(&settings, Some("--server")).is_err());
        assert_eq!(
            profile_list_args(&Settings::default()),
            ["--json", "profile", "--list"]
        );
        assert_eq!(sessions_args(&Settings::default()), ["--json", "sessions"]);
    }

    #[test]
    fn session_files_are_read_by_name_only() {
        let data = temp("names");
        let dir = session(&data);
        std::fs::write(dir.join("server.stderr.log"), "line one\nline two\n").unwrap();
        std::fs::write(dir.join("notes.txt"), "not a session file").unwrap();

        let file = read_session_file(&data, ID, "server.stderr.log").unwrap();
        assert_eq!(file.text, "line one\nline two\n");
        assert_eq!(file.bytes, 18);
        assert!(!file.truncated);

        assert!(read_session_file(&data, ID, "notes.txt").is_err());
        assert!(read_session_file(&data, ID, "../../account.json").is_err());
        assert!(read_session_file(&data, "../launcher", "status.json").is_err());
        // A listed name that is missing is an error, not an empty file.
        assert!(read_session_file(&data, ID, "game.stderr.log").is_err());
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn the_servers_session_file_record_becomes_the_viewers_text() {
        let record = serde_json::json!({"version": 1, "id": "a".repeat(32),
            "name": "server.stderr.log", "bytes": 12, "text": "hello
", "truncated": false});
        let text = session_file_text(&record).unwrap();
        assert_eq!(
            (
                text.name.as_str(),
                text.bytes,
                text.text.as_str(),
                text.truncated
            ),
            (
                "server.stderr.log",
                12,
                "hello
",
                false
            )
        );
        assert!(session_file_text(&serde_json::json!({"name": "x"})).is_err());
    }

    #[test]
    fn session_files_stop_at_the_log_bound() {
        let data = temp("bound");
        let dir = session(&data);
        let big = vec![b'x'; MAX_SESSION_FILE_BYTES as usize + 10];
        std::fs::write(dir.join("server.stderr.log"), &big).unwrap();
        let file = read_session_file(&data, ID, "server.stderr.log").unwrap();
        assert!(file.truncated);
        assert_eq!(file.text.len() as u64, MAX_SESSION_FILE_BYTES);
        assert_eq!(file.bytes, MAX_SESSION_FILE_BYTES + 10);
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn invalid_utf8_is_replaced_rather_than_refused() {
        let data = temp("utf8");
        let dir = session(&data);
        std::fs::write(dir.join("game.stdout.log"), b"Qt: \xff ok\n").unwrap();
        let file = read_session_file(&data, ID, "game.stdout.log").unwrap();
        assert_eq!(file.text, "Qt: \u{fffd} ok\n");
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn a_folder_is_not_a_file() {
        let data = temp("folder");
        let dir = session(&data);
        std::fs::create_dir_all(dir.join("status.json")).unwrap();
        assert!(read_session_file(&data, ID, "status.json").is_err());
        assert!(session_folder(&data, ID).is_ok());
        assert!(session_folder(&temp("absent"), ID).is_err());
        let _ = std::fs::remove_dir_all(&data);
    }

    #[cfg(unix)]
    #[test]
    fn links_are_not_followed() {
        let data = temp("links");
        let dir = session(&data);
        let outside = temp("links-outside");
        std::fs::write(outside.join("secret"), "x").unwrap();
        std::os::unix::fs::symlink(outside.join("secret"), dir.join("server.stderr.log")).unwrap();
        assert!(read_session_file(&data, ID, "server.stderr.log").is_err());
        let other = "fedcba9876543210fedcba9876543210";
        std::os::unix::fs::symlink(&dir, data::session_dir(&data, other)).unwrap();
        assert!(session_folder(&data, other).is_err());
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
