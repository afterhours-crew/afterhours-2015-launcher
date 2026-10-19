// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's data directory, as far as the window needs it.
//!
//! The window reads two of the server's small records directly, so an
//! update can tell whether a session might still be running even when the
//! server cannot be asked (`current-session.json` and that session's
//! `status.json`), and copies saves aside before an update that changes the
//! bundled server. It writes nothing else in the data directory: setup,
//! accounts, sessions and their records stay the server's.

use crate::{pin, settings::Settings};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

pub const POINTER_FILE: &str = "current-session.json";
pub const LOCK_FILE: &str = "launcher.lock";
pub const ACCOUNT_FILE: &str = "account.json";
pub const BACKUPS_DIR: &str = "backups";
/// Records are small; the server refuses anything larger as well.
pub const MAX_RECORD_BYTES: u64 = 65_536;
/// Most save files one backup copies.
pub const MAX_BACKUP_FILES: usize = 256;

/// The server's default data directory, mirroring `nfs-afterhours`.
pub fn default_data_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|base| PathBuf::from(base).join("Afterhours2015"))
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join("Library/Application Support/Afterhours2015"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .map(|base| base.join("afterhours2015"))
    }
}

/// The data directory in use: the chosen one, else the server's default.
pub fn data_dir(settings: &Settings) -> Option<PathBuf> {
    settings.data_dir.clone().or_else(default_data_dir)
}

/// States in which a session can still change (the server's `is_live`).
pub fn is_live_state(state: &str) -> bool {
    matches!(
        state,
        "preparing" | "starting" | "activation" | "ready" | "stopping"
    )
}

/// The current session as its files record it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Recorded {
    /// No session was ever started in this data directory.
    None,
    Session {
        id: String,
        /// The state the supervisor last wrote; never `interrupted`.
        state: String,
        message: String,
        utc: String,
        /// For a live state only: whether some process holds the data
        /// directory's lock. `None` when the lock could not be probed.
        lock_held: Option<bool>,
    },
    /// The records exist but could not be read.
    Error { message: String },
}

#[derive(Deserialize)]
struct Pointer {
    version: u32,
    id: String,
}

#[derive(Deserialize)]
struct StatusRecord {
    id: String,
    utc: String,
    state: String,
    message: String,
}

fn is_id(text: &str) -> bool {
    text.len() == 32
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn read_record<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let meta = std::fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !meta.is_file() || meta.len() > MAX_RECORD_BYTES {
        return Err(format!("{} is not a small ordinary file.", path.display()));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))
}

/// The directory of a session.
pub fn session_dir(data: &Path, id: &str) -> PathBuf {
    data.join("artifacts").join("launcher").join(id)
}

/// Read `current-session.json` and that session's `status.json`.
pub fn recorded_session(data: &Path) -> Recorded {
    let pointer_path = data.join(POINTER_FILE);
    match std::fs::symlink_metadata(&pointer_path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Recorded::None,
        Err(e) => {
            return Recorded::Error {
                message: e.to_string(),
            };
        }
        Ok(_) => {}
    }
    let pointer: Pointer = match read_record(&pointer_path) {
        Ok(p) => p,
        Err(message) => return Recorded::Error { message },
    };
    if pointer.version != 1 || !is_id(&pointer.id) {
        return Recorded::Error {
            message: "current-session.json names no valid session.".into(),
        };
    }
    let status: StatusRecord =
        match read_record(&session_dir(data, &pointer.id).join("status.json")) {
            Ok(s) => s,
            Err(message) => return Recorded::Error { message },
        };
    if status.id != pointer.id {
        return Recorded::Error {
            message: "The session status names another session.".into(),
        };
    }
    let lock_held = if is_live_state(&status.state) {
        lock_held(data)
    } else {
        None
    };
    Recorded::Session {
        id: status.id,
        state: status.state,
        message: status.message,
        utc: status.utc,
        lock_held,
    }
}

/// Whether some process holds the data directory's advisory lock, probed
/// the way the server's own `status` does. Used only when the server cannot
/// be asked and the files say a session is live.
pub fn lock_held(data: &Path) -> Option<bool> {
    let file = match File::options()
        .read(true)
        .write(true)
        .open(data.join(LOCK_FILE))
    {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Some(false),
        Err(_) => return None,
    };
    match file.try_lock() {
        Ok(()) => {
            let _ = file.unlock();
            Some(false)
        }
        Err(std::fs::TryLockError::WouldBlock) => Some(true),
        Err(std::fs::TryLockError::Error(_)) => None,
    }
}

/// `YYYYMMDDTHHMMSSZ` for a point in time.
pub fn utc_stamp(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (days, rest) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60
    )
}

/// Days since 1970-01-01 to a proleptic Gregorian date (H. Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackedUpFile {
    /// Path relative to the backup folder, with `/` separators.
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupReport {
    /// `None` when there was nothing to copy.
    pub folder: Option<PathBuf>,
    pub files: Vec<BackedUpFile>,
}

#[derive(Serialize)]
struct Manifest<'a> {
    version: u32,
    created_utc: &'a str,
    from_server: &'a str,
    to_server: &'a str,
    files: &'a [BackedUpFile],
}

fn is_save_file(name: &str) -> bool {
    name.ends_with(".sqlite") || name.ends_with(".sqlite-wal") || name.ends_with(".sqlite-journal")
}

/// Copy `artifacts/account/*.sqlite` (with any `-wal` or `-journal`
/// beside it) and `account.json` into
/// `backups/<UTC stamp>-<from>-to-<to>/`, keeping their layout, check each
/// copy's SHA-256 against its source and write `backup.json` last. Restoring
/// is copying the folder's contents back while no session runs.
///
/// Call only while no session runs: a live server may be writing the files.
pub fn backup_saves(
    data: &Path,
    from_tag: &str,
    to_tag: &str,
    now: SystemTime,
) -> Result<BackupReport, String> {
    if !pin::is_release_tag(from_tag) || !pin::is_release_tag(to_tag) {
        return Err("Server versions must look like v1.2.3.".into());
    }
    let accounts = data.join("artifacts").join("account");
    let mut sources: Vec<(PathBuf, String)> = Vec::new();
    match std::fs::read_dir(&accounts) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().into_owned();
                let kind = entry.file_type().map_err(|e| e.to_string())?;
                if kind.is_file() && is_save_file(&name) {
                    sources.push((entry.path(), format!("artifacts/account/{name}")));
                }
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("{}: {e}", accounts.display())),
    }
    if sources.len() > MAX_BACKUP_FILES {
        return Err(format!(
            "{} holds more than {MAX_BACKUP_FILES} save files; back it up by hand.",
            accounts.display()
        ));
    }
    if sources.is_empty() {
        return Ok(BackupReport {
            folder: None,
            files: Vec::new(),
        });
    }
    let account = data.join(ACCOUNT_FILE);
    if std::fs::symlink_metadata(&account).is_ok_and(|m| m.is_file()) {
        sources.push((account, ACCOUNT_FILE.to_owned()));
    }
    sources.sort_by(|a, b| a.1.cmp(&b.1));

    let stamp = utc_stamp(now);
    let parent = data.join(BACKUPS_DIR);
    std::fs::create_dir_all(&parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    let folder = parent.join(format!("{stamp}-{from_tag}-to-{to_tag}"));
    // create_dir, not create_dir_all: never write into an existing backup.
    std::fs::create_dir(&folder).map_err(|e| format!("{}: {e}", folder.display()))?;

    let mut files = Vec::with_capacity(sources.len());
    for (source, relative) in &sources {
        let target = relative
            .split('/')
            .fold(folder.clone(), |path, part| path.join(part));
        if let Some(dir) = target.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let bytes =
            std::fs::copy(source, &target).map_err(|e| format!("{}: {e}", source.display()))?;
        let original = pin::sha256_file(source).map_err(|e| e.to_string())?;
        let copy = pin::sha256_file(&target).map_err(|e| e.to_string())?;
        if original != copy {
            return Err(format!(
                "The copy of {relative} does not match its source; the backup in {} is incomplete.",
                folder.display()
            ));
        }
        files.push(BackedUpFile {
            path: relative.clone(),
            bytes,
            sha256: copy,
        });
    }
    let manifest = Manifest {
        version: 1,
        created_utc: &stamp,
        from_server: from_tag,
        to_server: to_tag,
        files: &files,
    };
    let text = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("backup.json"), text).map_err(|e| e.to_string())?;
    Ok(BackupReport {
        folder: Some(folder),
        files,
    })
}

#[tauri::command]
pub fn recorded(state: State<'_, crate::AppState>) -> Recorded {
    let settings = state.settings();
    match data_dir(&settings) {
        Some(data) => recorded_session(&data),
        None => Recorded::None,
    }
}

/// Folders the window can open: the data directory, the current session's
/// directory and the backups.
#[tauri::command]
pub fn open_folder(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    which: String,
) -> Result<(), String> {
    let settings = state.settings();
    let data = data_dir(&settings).ok_or("No data folder is known on this system.")?;
    let path = match which.as_str() {
        "data" => data,
        "backups" => data.join(BACKUPS_DIR),
        "session" => match recorded_session(&data) {
            Recorded::Session { id, .. } => session_dir(&data, &id),
            _ => return Err("No session has been started yet.".into()),
        },
        _ => return Err(format!("Unknown folder {which}.")),
    };
    if !path.is_dir() {
        return Err(format!("{} does not exist yet.", path.display()));
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-data-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const ID: &str = "0123456789abcdef0123456789abcdef";

    fn seed(data: &Path, state: &str) {
        std::fs::write(
            data.join(POINTER_FILE),
            format!(r#"{{"version":1,"id":"{ID}"}}"#),
        )
        .unwrap();
        let dir = session_dir(data, ID);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("status.json"),
            format!(
                r#"{{"version":1,"id":"{ID}","utc":"2026-10-19T12:00:00Z","state":"{state}","message":"m","worker_pid":1,"game_pid":null,"server_pid":2}}"#
            ),
        )
        .unwrap();
    }

    #[test]
    fn stamps_are_utc_calendar_times() {
        assert_eq!(utc_stamp(UNIX_EPOCH), "19700101T000000Z");
        let t = UNIX_EPOCH + Duration::from_secs(1_792_411_440);
        assert_eq!(utc_stamp(t), "20261019T120400Z");
        let leap = UNIX_EPOCH + Duration::from_secs(951_782_400); // 2000-02-29
        assert_eq!(utc_stamp(leap), "20000229T000000Z");
    }

    #[test]
    fn recorded_sessions_are_read_and_checked() {
        let data = temp("recorded");
        assert_eq!(recorded_session(&data), Recorded::None);

        seed(&data, "finished");
        assert!(matches!(
            recorded_session(&data),
            Recorded::Session { ref state, lock_held: None, .. } if state == "finished"
        ));

        // A live record with nobody holding the lock: the supervisor is gone.
        seed(&data, "ready");
        assert!(matches!(
            recorded_session(&data),
            Recorded::Session { ref state, lock_held: Some(false), .. } if state == "ready"
        ));

        // A held lock means a supervisor is still there.
        let lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(data.join(LOCK_FILE))
            .unwrap();
        lock.lock().unwrap();
        assert!(matches!(
            recorded_session(&data),
            Recorded::Session {
                lock_held: Some(true),
                ..
            }
        ));
        drop(lock);

        std::fs::write(data.join(POINTER_FILE), r#"{"version":1,"id":"../x"}"#).unwrap();
        assert!(matches!(recorded_session(&data), Recorded::Error { .. }));
        std::fs::write(data.join(POINTER_FILE), vec![b' '; 70_000]).unwrap();
        assert!(matches!(recorded_session(&data), Recorded::Error { .. }));
        std::fs::remove_dir_all(data).unwrap();
    }

    #[test]
    fn backups_copy_saves_and_the_account_pointer_and_verify_them() {
        let data = temp("backup");
        let accounts = data.join("artifacts").join("account");
        std::fs::create_dir_all(&accounts).unwrap();
        std::fs::write(accounts.join(format!("{ID}.sqlite")), b"database").unwrap();
        std::fs::write(accounts.join(format!("{ID}.sqlite-wal")), b"wal").unwrap();
        std::fs::write(accounts.join(format!("{ID}.sqlite-shm")), b"shm").unwrap();
        std::fs::write(accounts.join("notes.txt"), b"not a save").unwrap();
        std::fs::write(data.join(ACCOUNT_FILE), b"{}").unwrap();
        let now = UNIX_EPOCH + Duration::from_secs(1_792_411_440);

        let report = backup_saves(&data, "v0.3.0", "v0.4.0", now).unwrap();
        let folder = report.folder.clone().unwrap();
        assert_eq!(
            folder,
            data.join(BACKUPS_DIR)
                .join("20261019T120400Z-v0.3.0-to-v0.4.0")
        );
        let paths: Vec<&str> = report.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            [
                ACCOUNT_FILE,
                &format!("artifacts/account/{ID}.sqlite"),
                &format!("artifacts/account/{ID}.sqlite-wal"),
            ]
        );
        let copied = folder
            .join("artifacts")
            .join("account")
            .join(format!("{ID}.sqlite"));
        assert_eq!(std::fs::read(copied).unwrap(), b"database");
        let manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(folder.join("backup.json")).unwrap()).unwrap();
        assert_eq!(manifest["from_server"], "v0.3.0");
        assert_eq!(manifest["to_server"], "v0.4.0");
        assert_eq!(manifest["files"].as_array().unwrap().len(), 3);
        // Sources are untouched.
        assert_eq!(
            std::fs::read(accounts.join(format!("{ID}.sqlite"))).unwrap(),
            b"database"
        );

        // The same stamp never writes into an existing backup.
        assert!(backup_saves(&data, "v0.3.0", "v0.4.0", now).is_err());
        // Tags from a remote manifest never become arbitrary paths.
        assert!(backup_saves(&data, "v0.3.0", "../../x", now).is_err());
        std::fs::remove_dir_all(data).unwrap();
    }

    #[test]
    fn nothing_to_back_up_creates_nothing() {
        let data = temp("empty");
        let report = backup_saves(&data, "v0.3.0", "v0.4.0", UNIX_EPOCH).unwrap();
        assert_eq!(report.folder, None);
        assert!(!data.join(BACKUPS_DIR).exists());
        std::fs::remove_dir_all(data).unwrap();
    }

    #[test]
    fn the_default_data_directory_matches_the_server() {
        let dir = default_data_dir();
        if cfg!(windows) {
            assert!(dir.unwrap().ends_with("Afterhours2015"));
        }
        let custom = Settings {
            data_dir: Some(PathBuf::from("D:/My Afterhours data")),
            ..Settings::default()
        };
        assert_eq!(
            data_dir(&custom),
            Some(PathBuf::from("D:/My Afterhours data"))
        );
    }
}
