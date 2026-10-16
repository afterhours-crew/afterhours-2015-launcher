// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Running `nfs-afterhours` and reporting what it says.
//!
//! Short commands (`check`, `status`, `stop`) run to completion with
//! `--json` and their one JSON object is returned to the window. A session
//! (`setup`, `serve`, `start`) is a long-running child: its console lines
//! are forwarded as `session-output` events, `status --json` is polled and
//! forwarded as `session-status` events, and its exit as `session-exit`.
//! The child is the CLI's own front-end command, which in turn runs the
//! supervisor as a separate process, so the process tree is exactly what a
//! terminal user gets.

use crate::settings::Settings;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};

/// Where the command-line launcher and server were found.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CliInfo {
    pub launcher: Option<PathBuf>,
    pub server: Option<PathBuf>,
    pub version: Option<String>,
}

/// A failed CLI command: its exit code and the message it printed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CliError {
    pub exit: i32,
    pub message: String,
}

/// Result of a short command: either its JSON object or a refusal.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CliResult {
    Ok { value: serde_json::Value },
    Error { exit: i32, message: String },
}

/// One line of session console output, parsed where it has structure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OutputLine {
    /// `[HH:MM:SS] state : message` from the supervisor.
    Status {
        time: String,
        state: String,
        message: String,
    },
    /// Anything else: server or game diagnostics, launch context.
    Text { text: String },
}

/// Parse one console line from the supervisor.
pub fn parse_line(line: &str) -> OutputLine {
    let trimmed = line.trim_end();
    if let Some(rest) = trimmed.strip_prefix('[')
        && let Some((time, rest)) = rest.split_once("] ")
        && time.len() == 8
        && let Some((state, message)) = rest.split_once(" : ")
        && !state.is_empty()
        && state.chars().all(|c| c.is_ascii_lowercase())
    {
        return OutputLine::Status {
            time: time.to_owned(),
            state: state.to_owned(),
            message: message.to_owned(),
        };
    }
    OutputLine::Text {
        text: trimmed.to_owned(),
    }
}

fn exe(name: &str) -> String {
    format!("{name}{}", std::env::consts::EXE_SUFFIX)
}

/// Find the launcher and server executables in the configured directory.
pub fn locate(settings: &Settings) -> CliInfo {
    let Some(dir) = &settings.cli_dir else {
        return CliInfo::default();
    };
    let launcher = dir.join(exe("nfs-afterhours"));
    let server = dir.join(exe("nfs-server"));
    let version = launcher.is_file().then(|| {
        Command::new(&launcher)
            .arg("--version")
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
            .filter(|v| !v.is_empty())
    });
    CliInfo {
        launcher: launcher.is_file().then_some(launcher),
        server: server.is_file().then_some(server),
        version: version.flatten(),
    }
}

/// Global arguments every invocation shares.
pub fn global_args(settings: &Settings) -> Vec<String> {
    let mut args = vec!["--json".to_owned()];
    if let Some(data) = &settings.data_dir {
        args.push("--data-dir".into());
        args.push(data.to_string_lossy().into_owned());
    }
    args
}

/// Arguments for a session command.
pub fn session_args(
    settings: &Settings,
    action: &str,
    server: &Path,
) -> Result<Vec<String>, String> {
    let game = settings
        .game_dir
        .as_ref()
        .ok_or("Choose the game folder first.")?;
    let mut args = vec![
        action.to_owned(),
        "--game-dir".into(),
        game.to_string_lossy().into_owned(),
        "--server".into(),
        server.to_string_lossy().into_owned(),
    ];
    if action != "check"
        && let Some(name) = settings
            .player_name
            .as_deref()
            .filter(|n| !n.trim().is_empty())
    {
        args.push("--player-name".into());
        args.push(name.trim().to_owned());
    }
    Ok(args)
}

fn run_short(launcher: &Path, args: &[String]) -> Result<CliResult, String> {
    let output = Command::new(launcher)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Could not run the launcher: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit = output.status.code().unwrap_or(-1);
    if exit == 0 {
        let value: serde_json::Value = serde_json::from_str(stdout.trim())
            .map_err(|e| format!("The launcher printed something other than JSON: {e}"))?;
        return Ok(CliResult::Ok { value });
    }
    let message = stderr
        .lines()
        .map(str::trim)
        .rfind(|l| !l.is_empty())
        .unwrap_or("The launcher failed without a message.")
        .to_owned();
    Ok(CliResult::Error { exit, message })
}

/// A session child the window started.
pub struct RunningSession {
    pub action: String,
    child: std::process::Child,
    stop_polling: Arc<AtomicBool>,
}

fn require_launcher(settings: &Settings) -> Result<(PathBuf, PathBuf), String> {
    let info = locate(settings);
    let launcher = info
        .launcher
        .ok_or("nfs-afterhours was not found. Point Settings at a build directory.")?;
    let server = info
        .server
        .ok_or("nfs-server was not found next to nfs-afterhours.")?;
    Ok((launcher, server))
}

#[tauri::command]
pub fn locate_cli(state: State<'_, crate::AppState>) -> CliInfo {
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    locate(&settings)
}

#[tauri::command]
pub fn run_check(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let (launcher, server) = require_launcher(&settings)?;
    let mut args = global_args(&settings);
    args.extend(session_args(&settings, "check", &server)?);
    run_short(&launcher, &args)
}

#[tauri::command]
pub fn session_status(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let (launcher, _) = require_launcher(&settings)?;
    let mut args = global_args(&settings);
    args.push("status".into());
    run_short(&launcher, &args)
}

#[tauri::command]
pub fn stop_session(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let (launcher, _) = require_launcher(&settings)?;
    let mut args = global_args(&settings);
    args.push("stop".into());
    run_short(&launcher, &args)
}

/// The current session directory, derived from `status --json`.
#[tauri::command]
pub fn session_dir(state: State<'_, crate::AppState>) -> Result<Option<PathBuf>, String> {
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let (launcher, _) = require_launcher(&settings)?;
    let mut args = global_args(&settings);
    args.push("status".into());
    let CliResult::Ok { value } = run_short(&launcher, &args)? else {
        return Ok(None);
    };
    let Some(id) = value["id"].as_str() else {
        return Ok(None);
    };
    let data = match &settings.data_dir {
        Some(dir) => dir.clone(),
        None => {
            // Ask the CLI's own default by reading the data directory out of
            // `check`; simpler: the status record does not carry it, so a
            // missing data_dir means we only know the relative layout.
            return Ok(None);
        }
    };
    Ok(Some(data.join("artifacts").join("launcher").join(id)))
}

/// Start `setup`, `serve` or `start` and stream its output as events.
#[tauri::command]
pub fn start_session(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    action: String,
) -> Result<(), String> {
    if !["setup", "serve", "start"].contains(&action.as_str()) {
        return Err(format!("Unknown action {action}."));
    }
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let (launcher, server) = require_launcher(&settings)?;
    let mut guard = state.session.lock().map_err(|_| "session state poisoned")?;
    if let Some(running) = guard.as_mut()
        && running
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none()
    {
        return Err("A session is already running.".into());
    }
    // Session commands print human lines; `--json` only changes the final
    // record, so it is left off here and status is polled separately.
    let mut args = Vec::new();
    if let Some(data) = &settings.data_dir {
        args.push("--data-dir".to_owned());
        args.push(data.to_string_lossy().into_owned());
    }
    args.extend(session_args(&settings, &action, &server)?);
    let mut child = Command::new(&launcher)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the launcher: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    for (reader, is_err) in [
        (Box::new(stdout) as Box<dyn std::io::Read + Send>, false),
        (Box::new(stderr), true),
    ] {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(reader).lines().map_while(Result::ok) {
                let parsed = if is_err {
                    OutputLine::Text { text: line }
                } else {
                    parse_line(&line)
                };
                let _ = app.emit("session-output", &parsed);
            }
        });
    }
    let stop_polling = Arc::new(AtomicBool::new(false));
    {
        let app = app.clone();
        let stop = Arc::clone(&stop_polling);
        let launcher = launcher.clone();
        let global = global_args(&settings);
        std::thread::spawn(move || {
            let mut args = global;
            args.push("status".into());
            while !stop.load(Ordering::SeqCst) {
                if let Ok(result) = run_short(&launcher, &args) {
                    let _ = app.emit("session-status", &result);
                }
                std::thread::sleep(Duration::from_millis(750));
            }
        });
    }
    *guard = Some(RunningSession {
        action: action.clone(),
        child,
        stop_polling,
    });
    drop(guard);
    // Watch for exit on a thread; the mutex is only held briefly each poll.
    let state_app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(300));
            let Some(state) = state_app.try_state::<crate::AppState>() else {
                break;
            };
            let mut guard = match state.session.lock() {
                Ok(guard) => guard,
                Err(_) => break,
            };
            let Some(running) = guard.as_mut() else {
                break;
            };
            match running.child.try_wait() {
                Ok(Some(status)) => {
                    running.stop_polling.store(true, Ordering::SeqCst);
                    let _ = state_app.emit(
                        "session-exit",
                        serde_json::json!({"action": running.action, "code": status.code()}),
                    );
                    // One final status so the window shows the end state.
                    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
                    if let Ok((launcher, _)) = require_launcher(&settings) {
                        let mut args = global_args(&settings);
                        args.push("status".into());
                        if let Ok(result) = run_short(&launcher, &args) {
                            let _ = state_app.emit("session-status", &result);
                        }
                    }
                    *guard = None;
                    break;
                }
                Ok(None) => {}
                Err(_) => break,
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supervisor_lines_are_parsed_and_everything_else_is_text() {
        assert_eq!(
            parse_line(
                "[20:31:02] ready : Local routing is ready. Press Space in the game to connect."
            ),
            OutputLine::Status {
                time: "20:31:02".into(),
                state: "ready".into(),
                message: "Local routing is ready. Press Space in the game to connect.".into(),
            }
        );
        assert_eq!(
            parse_line("Launch context: UTC 2026-10-13, marker 1497848135.\r\n"),
            OutputLine::Text {
                text: "Launch context: UTC 2026-10-13, marker 1497848135.".into()
            }
        );
        assert_eq!(
            parse_line("[not a time] ready : x"),
            OutputLine::Text {
                text: "[not a time] ready : x".into()
            }
        );
    }

    #[test]
    fn arguments_follow_the_cli_contract() {
        let settings = Settings {
            cli_dir: Some(PathBuf::from("/b")),
            game_dir: Some(PathBuf::from("/g")),
            data_dir: Some(PathBuf::from("/d")),
            player_name: Some("  Nova ".into()),
            avatar: None,
            first_run_done: true,
        };
        assert_eq!(global_args(&settings), ["--json", "--data-dir", "/d"]);
        let args = session_args(&settings, "serve", Path::new("/b/nfs-server")).unwrap();
        assert_eq!(
            args,
            [
                "serve",
                "--game-dir",
                "/g",
                "--server",
                "/b/nfs-server",
                "--player-name",
                "Nova"
            ]
        );
        let check = session_args(&settings, "check", Path::new("/b/nfs-server")).unwrap();
        assert!(!check.contains(&"--player-name".to_owned()));
        let none = Settings::default();
        assert!(session_args(&none, "serve", Path::new("/b/nfs-server")).is_err());
        assert_eq!(locate(&none), CliInfo::default());
    }

    #[cfg(unix)]
    #[test]
    fn short_commands_return_json_or_the_last_stderr_line() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("afterhours-gui-cli-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("nfs-afterhours");
        std::fs::write(&fake, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'nfs-afterhours 0.1.0'; exit 0; fi\nfor a in \"$@\"; do if [ \"$a\" = status ]; then echo '{\"state\":\"none\"}'; exit 0; fi; done\necho 'ignored' >&2\necho 'Choose a data directory outside the game installation.' >&2\nexit 1\n").unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(dir.join("nfs-server"), b"").unwrap();
        let settings = Settings {
            cli_dir: Some(dir.clone()),
            ..Settings::default()
        };
        let info = locate(&settings);
        assert_eq!(info.version.as_deref(), Some("nfs-afterhours 0.1.0"));
        assert!(info.server.is_some());
        let ok = run_short(&fake, &["--json".into(), "status".into()]).unwrap();
        assert!(matches!(ok, CliResult::Ok { value } if value["state"] == "none"));
        let err = run_short(&fake, &["--json".into(), "check".into()]).unwrap();
        assert!(
            matches!(err, CliResult::Error { exit: 1, message } if message.starts_with("Choose a data directory"))
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
