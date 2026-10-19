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

fn settings_of(state: &State<'_, crate::AppState>) -> Settings {
    state.settings.lock().map(|s| s.clone()).unwrap_or_default()
}

async fn run_read(args: Vec<String>) -> Result<cli::CliResult, String> {
    let server = server::current()?;
    tauri::async_runtime::spawn_blocking(move || cli::run_json(&server.path, &args, READ_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
}

/// `profile --json`, for the active save or `account_id`.
#[tauri::command]
pub async fn profile(
    state: State<'_, crate::AppState>,
    account_id: Option<String>,
) -> Result<cli::CliResult, String> {
    let args = profile_args(&settings_of(&state), account_id.as_deref())?;
    run_read(args).await
}

/// `profile --list --json`.
#[tauri::command]
pub async fn profile_list(state: State<'_, crate::AppState>) -> Result<cli::CliResult, String> {
    run_read(profile_list_args(&settings_of(&state))).await
}

/// `sessions --json`.
#[tauri::command]
pub async fn sessions(state: State<'_, crate::AppState>) -> Result<cli::CliResult, String> {
    run_read(sessions_args(&settings_of(&state))).await
}

/// One file of one session folder, for the log viewer.
#[tauri::command]
pub async fn session_file(
    state: State<'_, crate::AppState>,
    id: String,
    name: String,
) -> Result<SessionFileText, String> {
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
