// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Running the bundled `Afterhours.exe` and reporting what it says.
//!
//! Short commands (`check`, `status`, `stop`, `--version`) run to
//! completion within a deadline, and with `--json` their one JSON object is
//! returned to the window. A session (`setup`, `serve`, `start`) is a
//! long-running child: its console lines are forwarded as `session-output`
//! events, `status --json` is polled and forwarded as `session-status`
//! events, and its exit as `session-exit`. The child is the CLI's own
//! front-end command, which runs the supervisor as a separate process, so
//! the process tree is exactly what a terminal user gets.
//!
//! Every child runs without a console window of its own (`CREATE_NO_WINDOW`
//! on Windows): its output is piped here.

use crate::{server, settings::Settings};
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

/// Deadlines for the short commands. `check` hashes the game executable.
pub const STATUS_TIMEOUT: Duration = Duration::from_secs(10);
pub const STOP_TIMEOUT: Duration = Duration::from_secs(20);
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(120);

/// Most output kept from one short command, per stream.
const MAX_SHORT_OUTPUT: usize = 1024 * 1024;

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

/// Global arguments every JSON invocation shares.
pub fn global_args(settings: &Settings) -> Vec<String> {
    let mut args = vec!["--json".to_owned()];
    args.extend(data_dir_args(settings));
    args
}

fn data_dir_args(settings: &Settings) -> Vec<String> {
    match &settings.data_dir {
        Some(data) => vec!["--data-dir".to_owned(), data.to_string_lossy().into_owned()],
        None => Vec::new(),
    }
}

/// Arguments for `check` or a session command. The bundled executable is
/// its own server, so `--server` is never passed.
pub fn session_args(settings: &Settings, action: &str) -> Result<Vec<String>, String> {
    let game = settings
        .game_dir
        .as_ref()
        .ok_or("Choose the game folder first.")?;
    let mut args = vec![
        action.to_owned(),
        "--game-dir".into(),
        game.to_string_lossy().into_owned(),
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

fn command(exe: &Path) -> Command {
    let mut command = Command::new(exe);
    command.env("NO_COLOR", "1").stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// What a short command printed and how it ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl RawOutput {
    /// The CLI puts its refusal on the last non-empty stderr line.
    pub fn last_stderr_line(&self) -> String {
        self.stderr
            .lines()
            .map(str::trim)
            .rfind(|l| !l.is_empty())
            .unwrap_or("The server failed without a message.")
            .to_owned()
    }
}

fn read_bounded(mut reader: impl Read) -> String {
    let mut kept = Vec::new();
    let mut buffer = [0u8; 8192];
    while let Ok(read) = reader.read(&mut buffer) {
        if read == 0 {
            break;
        }
        let room = MAX_SHORT_OUTPUT.saturating_sub(kept.len());
        kept.extend_from_slice(&buffer[..read.min(room)]);
    }
    String::from_utf8_lossy(&kept).into_owned()
}

/// Run a short command to completion, killing it at the deadline.
pub fn run_raw(exe: &Path, args: &[String], timeout: Duration) -> Result<RawOutput, String> {
    let mut child = command(exe)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not run the server: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .map(|s| std::thread::spawn(|| read_bounded(s)));
    let stderr = child
        .stderr
        .take()
        .map(|s| std::thread::spawn(|| read_bounded(s)));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "The server did not answer within {} seconds.",
                    timeout.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(e) => return Err(format!("Could not wait for the server: {e}")),
        }
    };
    let join = |handle: Option<std::thread::JoinHandle<String>>| {
        handle.and_then(|h| h.join().ok()).unwrap_or_default()
    };
    Ok(RawOutput {
        code: status.code(),
        stdout: join(stdout),
        stderr: join(stderr),
    })
}

/// Run a `--json` command: its object on success, its refusal otherwise.
pub fn run_json(exe: &Path, args: &[String], timeout: Duration) -> Result<CliResult, String> {
    let output = run_raw(exe, args, timeout)?;
    if output.code == Some(0) {
        let value: serde_json::Value = serde_json::from_str(output.stdout.trim())
            .map_err(|e| format!("The server printed something other than JSON: {e}"))?;
        return Ok(CliResult::Ok { value });
    }
    Ok(CliResult::Error {
        exit: output.code.unwrap_or(-1),
        message: output.last_stderr_line(),
    })
}

/// `status --json` for the given settings.
pub fn status(settings: &Settings) -> Result<CliResult, String> {
    let server = server::current()?;
    let mut args = global_args(settings);
    args.push("status".into());
    run_json(&server.path, &args, STATUS_TIMEOUT)
}

/// A session child the window started.
pub struct RunningSession {
    pub action: String,
    child: std::process::Child,
    stop_polling: Arc<AtomicBool>,
}

impl RunningSession {
    /// Whether the front-end command is still running.
    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

fn settings_of(state: &State<'_, crate::AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub async fn run_check(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    let server = server::current()?;
    let mut args = global_args(&settings);
    args.extend(session_args(&settings, "check")?);
    tauri::async_runtime::spawn_blocking(move || run_json(&server.path, &args, CHECK_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn session_status(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    tauri::async_runtime::spawn_blocking(move || status(&settings))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_session(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    let server = server::current()?;
    let mut args = global_args(&settings);
    args.push("stop".into());
    tauri::async_runtime::spawn_blocking(move || run_json(&server.path, &args, STOP_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
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
    let settings = settings_of(&state);
    let server = server::current()?;
    let mut guard = state.session.lock().map_err(|_| "session state poisoned")?;
    if let Some(running) = guard.as_mut()
        && running.is_running()
    {
        return Err("A session is already running.".into());
    }
    // Session commands print human lines; `--json` only changes the final
    // record, so it is left off here and status is polled separately.
    let mut args = data_dir_args(&settings);
    args.extend(session_args(&settings, &action)?);
    let mut child = command(&server.path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the server: {e}"))?;
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
        let settings = settings.clone();
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                if let Ok(result) = status(&settings) {
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
                    let settings = state.settings();
                    if let Ok(result) = self::status(&settings) {
                        let _ = state_app.emit("session-status", &result);
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
    use std::path::PathBuf;

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
    fn arguments_follow_the_bundled_cli_contract() {
        let settings = Settings {
            game_dir: Some(PathBuf::from("/g")),
            data_dir: Some(PathBuf::from("/d")),
            player_name: Some("  Nova ".into()),
            first_run_done: true,
            ..Settings::default()
        };
        assert_eq!(global_args(&settings), ["--json", "--data-dir", "/d"]);
        let args = session_args(&settings, "start").unwrap();
        assert_eq!(args, ["start", "--game-dir", "/g", "--player-name", "Nova"]);
        assert!(!args.contains(&"--server".to_owned()));
        let check = session_args(&settings, "check").unwrap();
        assert_eq!(check, ["check", "--game-dir", "/g"]);
        assert!(session_args(&Settings::default(), "serve").is_err());
        assert_eq!(global_args(&Settings::default()), ["--json"]);
    }

    #[test]
    fn the_last_stderr_line_is_the_refusal() {
        let output = RawOutput {
            code: Some(1),
            stdout: String::new(),
            stderr: "progress\nChoose a data directory outside the game installation.\n\n".into(),
        };
        assert_eq!(
            output.last_stderr_line(),
            "Choose a data directory outside the game installation."
        );
        let silent = RawOutput {
            code: Some(5),
            stdout: String::new(),
            stderr: String::new(),
        };
        assert!(silent.last_stderr_line().contains("without a message"));
    }

    #[test]
    fn long_output_is_cut_at_the_bound() {
        let long = vec![b'x'; MAX_SHORT_OUTPUT + 10];
        assert_eq!(read_bounded(&long[..]).len(), MAX_SHORT_OUTPUT);
    }

    #[cfg(unix)]
    #[test]
    fn short_commands_return_json_refusals_or_a_timeout() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("afterhours-gui-cli-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("Afterhours");
        std::fs::write(&fake, "#!/bin/sh\nfor a in \"$@\"; do if [ \"$a\" = status ]; then echo '{\"state\":\"none\"}'; exit 0; fi; if [ \"$a\" = slow ]; then sleep 5; fi; done\necho 'ignored' >&2\necho 'Choose a data directory outside the game installation.' >&2\nexit 1\n").unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        let second = Duration::from_secs(1);
        let ok = run_json(&fake, &["--json".into(), "status".into()], second).unwrap();
        assert!(matches!(ok, CliResult::Ok { value } if value["state"] == "none"));
        let err = run_json(&fake, &["--json".into(), "check".into()], second).unwrap();
        assert!(
            matches!(err, CliResult::Error { exit: 1, message } if message.starts_with("Choose a data directory"))
        );
        let slow = run_json(&fake, &["slow".into()], Duration::from_millis(200)).unwrap_err();
        assert!(slow.contains("did not answer"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn short_commands_return_json_refusals_or_a_timeout() {
        // A batch file stands in for the server.
        let dir = std::env::temp_dir().join(format!("afterhours-gui-cli-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("fake-server.cmd");
        std::fs::write(
            &fake,
            "@echo off\r\n\
             if \"%~2\"==\"status\" (echo {\"state\":\"none\"}& exit /b 0)\r\n\
             if \"%~1\"==\"slow\" (ping -n 6 127.0.0.1 >NUL)\r\n\
             echo ignored 1>&2\r\n\
             echo Refused here. 1>&2\r\n\
             exit /b 1\r\n",
        )
        .unwrap();
        let ten = Duration::from_secs(10);
        let ok = run_json(&fake, &["--json".into(), "status".into()], ten).unwrap();
        assert!(
            matches!(&ok, CliResult::Ok { value } if value["state"] == "none"),
            "{ok:?}"
        );
        let err = run_json(&fake, &["--json".into(), "check".into()], ten).unwrap();
        assert!(
            matches!(&err, CliResult::Error { exit: 1, message } if message == "Refused here."),
            "{err:?}"
        );
        let slow = run_raw(&fake, &["slow".into()], Duration::from_millis(300)).unwrap_err();
        assert!(slow.contains("did not answer"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
