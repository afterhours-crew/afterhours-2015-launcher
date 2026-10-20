// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Running the bundled `Afterhours.exe` and reporting what it says.
//!
//! Short commands (`check`, `status`, `stop`, `play`, `settings`, `--version`) run to
//! completion within a deadline, and with `--json` their one JSON object is
//! returned to the window. A session (`setup`, `serve`, `start`) is a
//! long-running child: its console lines are forwarded as `session-output`
//! events, `status --json` is polled and forwarded as `session-status`
//! events, and its exit as `session-exit`. The child is the CLI's own
//! front-end command, which runs the supervisor as a separate process, so
//! the process tree is exactly what a terminal user gets.
//!
//! When the server reports the `events` capability the window asks for
//! `--events`: stdout is then a stream of JSON `event` records instead of
//! human lines. `status`, `diagnostic`, `session` and `final` records become
//! the same `session-output` lines the human stream gave, and `map-feed`
//! records (where the cars are) are forwarded whole as `map-feed` events.
//! Servers without `events` keep the human-line path.
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

/// Longest session output line passed on. The server bounds a map frame to
/// 1 MiB; a longer line is left out whole and a note stands in for it.
pub const MAX_SESSION_LINE: usize = 2 * 1024 * 1024;

/// Result of a short command: either its JSON object or a refusal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// What one stdout line of a session becomes for the window.
#[derive(Debug, Clone, PartialEq)]
pub enum Forward {
    /// A `session-output` console line.
    Output(OutputLine),
    /// A `map-feed` record, forwarded whole as a `map-feed` event.
    MapFeed(serde_json::Value),
    /// Nothing to show: a successful `final`, or an event kind this
    /// launcher does not read (readers ignore what they do not know).
    Skip,
}

/// `HH:MM:SS` from a record's UTC time (`YYYY-MM-DDTHH:MM:SSZ`, or the old
/// launcher's longer ISO 8601 form): the human stream's line prefix.
fn clock_of(utc: Option<&str>) -> Option<String> {
    let time = utc?.split_once('T')?.1.get(..8)?;
    let bytes = time.as_bytes();
    let shape = bytes.iter().enumerate().all(|(i, b)| {
        if i == 2 || i == 5 {
            *b == b':'
        } else {
            b.is_ascii_digit()
        }
    });
    shape.then(|| time.to_owned())
}

/// Read one line of an `--events` stream (`schemas/event.schema.json`).
/// `status`, `diagnostic`, `session` and a failed `final` become the
/// console lines the human stream printed; a line that is not an event
/// record is shown as text rather than lost.
pub fn parse_event(line: &str) -> Forward {
    let trimmed = line.trim_end();
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(value @ serde_json::Value::Object(_)) => value,
        _ if trimmed.is_empty() => return Forward::Skip,
        _ => {
            return Forward::Output(OutputLine::Text {
                text: trimmed.to_owned(),
            });
        }
    };
    let text = |key: &str| value.get(key).and_then(serde_json::Value::as_str);
    match text("event") {
        Some("map-feed") => Forward::MapFeed(value),
        Some("status") => {
            let status = &value["status"];
            let field = |key: &str| status.get(key).and_then(serde_json::Value::as_str);
            let (Some(state), Some(message)) = (field("state"), field("message")) else {
                return Forward::Skip;
            };
            match clock_of(field("utc")).or_else(|| clock_of(text("utc"))) {
                Some(time) => Forward::Output(OutputLine::Status {
                    time,
                    state: state.to_owned(),
                    message: message.to_owned(),
                }),
                None => Forward::Output(OutputLine::Text {
                    text: format!("{state} : {message}"),
                }),
            }
        }
        Some("diagnostic") => match text("text") {
            Some(line) => Forward::Output(OutputLine::Text {
                text: line.to_owned(),
            }),
            None => Forward::Skip,
        },
        Some("session") => match text("session_directory") {
            Some(dir) => Forward::Output(OutputLine::Text {
                text: format!("Session logs: {dir}"),
            }),
            None => Forward::Skip,
        },
        // The refusal the human stream printed on stderr.
        Some("final") => match text("message") {
            Some(message) => Forward::Output(OutputLine::Text {
                text: message.to_owned(),
            }),
            None => Forward::Skip,
        },
        _ => Forward::Skip,
    }
}

/// Call `each` for every line of `reader`, without its line ending. A line
/// longer than `max` bytes is skipped whole and reported as `None`; the
/// rest of the stream goes on.
pub fn read_lines(reader: impl Read, max: usize, mut each: impl FnMut(Option<String>)) {
    let mut reader = BufReader::new(reader);
    let mut line = Vec::new();
    let mut overlong = false;
    loop {
        let (used, ended) = match reader.fill_buf() {
            Ok([]) => {
                if overlong {
                    each(None);
                } else if !line.is_empty() {
                    each(Some(text_of(&line)));
                }
                return;
            }
            Ok(buffer) => {
                let end = buffer.iter().position(|b| *b == b'\n');
                let chunk = &buffer[..end.unwrap_or(buffer.len())];
                if !overlong && line.len() + chunk.len() > max {
                    overlong = true;
                    line = Vec::new();
                } else if !overlong {
                    line.extend_from_slice(chunk);
                }
                (chunk.len() + usize::from(end.is_some()), end.is_some())
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return,
        };
        reader.consume(used);
        if ended {
            each((!overlong).then(|| text_of(&line)));
            line.clear();
            overlong = false;
        }
    }
}

fn text_of(line: &[u8]) -> String {
    let text = String::from_utf8_lossy(line);
    text.strip_suffix('\r').unwrap_or(&text).to_owned()
}

/// What stands in for a line longer than `MAX_SESSION_LINE`.
fn left_out() -> OutputLine {
    OutputLine::Text {
        text: format!(
            "A line of more than {} MiB was left out.",
            MAX_SESSION_LINE / (1024 * 1024)
        ),
    }
}

/// Read a session's stdout: event records with `--events`, human lines
/// without.
pub fn pump_stdout(reader: impl Read, events: bool, mut forward: impl FnMut(Forward)) {
    read_lines(reader, MAX_SESSION_LINE, |line| {
        forward(match line {
            None => Forward::Output(left_out()),
            Some(line) if events => parse_event(&line),
            Some(line) => Forward::Output(parse_line(&line)),
        });
    });
}

/// Read a session's stderr: every line is text, in either mode.
pub fn pump_stderr(reader: impl Read, mut forward: impl FnMut(OutputLine)) {
    read_lines(reader, MAX_SESSION_LINE, |line| {
        forward(line.map_or_else(left_out, |text| OutputLine::Text { text }));
    });
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

/// How a session reports to the window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stream {
    /// Human console lines on its output; status is polled.
    Lines,
    /// One JSON event record per line on its output (`--events`).
    Events,
    /// The session API (`--api`): status, console lines and map frames come
    /// from its event stream; standard output holds only `session` and
    /// `final`.
    Api,
}

impl Stream {
    /// The best of what the server reports: the API, else events, else lines.
    pub fn offered(events: bool, api: bool) -> Self {
        match (api, events) {
            (true, _) => Stream::Api,
            (false, true) => Stream::Events,
            (false, false) => Stream::Lines,
        }
    }
}

/// Arguments for starting a session. `--json` only changes the final
/// record, so it is left off.
pub fn start_args(
    settings: &Settings,
    action: &str,
    stream: Stream,
) -> Result<Vec<String>, String> {
    let mut args = data_dir_args(settings);
    args.extend(session_args(settings, action)?);
    match stream {
        Stream::Lines => {}
        Stream::Events => args.push("--events".into()),
        Stream::Api => args.push("--api".into()),
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
    /// Started with `--api`: closing the window stops it instead of waiting.
    pub api: bool,
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

/// `stop --json` for the given settings.
pub fn stop(settings: &Settings) -> Result<CliResult, String> {
    let server = server::current()?;
    let mut args = global_args(settings);
    args.push("stop".into());
    run_json(&server.path, &args, STOP_TIMEOUT)
}

/// Ask the session to stop: through its API when the window follows one,
/// else with the `stop` command.
#[tauri::command]
pub async fn stop_session(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    let endpoint = state.endpoint();
    tauri::async_runtime::spawn_blocking(move || {
        match endpoint.and_then(|e| e.command("/v1/stop").ok()) {
            Some(result) => Ok(result),
            None => stop(&settings),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `play --json`: ask the running `serve` session to start the game. The
/// serving supervisor starts it in the same session, so its progress
/// arrives as that session's output and statuses; this only returns the
/// request's record, or the refusal (no serve session, a game already
/// running). Through the session API when the window follows one.
#[tauri::command]
pub async fn play_game(state: State<'_, crate::AppState>) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    let server = server::current()?;
    let endpoint = state.endpoint();
    let mut args = global_args(&settings);
    args.push("play".into());
    tauri::async_runtime::spawn_blocking(move || {
        match endpoint.and_then(|e| e.command("/v1/play").ok()) {
            Some(result) => Ok(result),
            None => run_json(&server.path, &args, STATUS_TIMEOUT),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `api --json`: how to reach the current session's API, when one is live
/// and serves it; `None` otherwise.
pub fn api_endpoint(settings: &Settings) -> Result<Option<crate::connection::Endpoint>, String> {
    let server = server::current()?;
    let mut args = global_args(settings);
    args.push("api".into());
    match run_json(&server.path, &args, STATUS_TIMEOUT)? {
        CliResult::Ok { value } => {
            let record: crate::connection::ApiRecord = serde_json::from_value(value)
                .map_err(|e| format!("The server's API record is malformed: {e}"))?;
            crate::connection::Endpoint::from_record(&record).map(Some)
        }
        CliResult::Error { .. } => Ok(None),
    }
}

/// Follow a session that is already running, started by an earlier window
/// or elsewhere, through its API. `true` when one is followed.
#[tauri::command]
pub async fn connect_session(
    app: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<bool, String> {
    if state.endpoint().is_some() {
        return Ok(true);
    }
    let settings = settings_of(&state);
    let found = tauri::async_runtime::spawn_blocking(move || api_endpoint(&settings))
        .await
        .map_err(|e| e.to_string())??;
    match found {
        Some(endpoint) => {
            crate::connection::follow(&app, endpoint);
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Arguments for `settings --json`: read when both are `None`, else save
/// the given amounts for later sessions. `rivals` is a count or
/// `original`; anything else is refused before the server runs.
pub fn settings_args(
    settings: &Settings,
    traffic: Option<u16>,
    rivals: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut args = global_args(settings);
    args.push("settings".into());
    if let Some(percent) = traffic {
        args.push("--traffic".into());
        args.push(percent.to_string());
    }
    if let Some(rivals) = rivals {
        if rivals != "original" && rivals.parse::<u16>().is_err() {
            return Err(format!(
                "Rivals must be a count or \"original\", not {rivals:?}."
            ));
        }
        args.push("--rivals".into());
        args.push(rivals.to_owned());
    }
    Ok(args)
}

/// `settings --json`: the saved traffic and rival amounts, or save new
/// ones. Saving is refused (exit 1) while a session holds the data
/// directory, because a running session keeps the values it started with.
#[tauri::command]
pub async fn world_settings(
    state: State<'_, crate::AppState>,
    traffic: Option<u16>,
    rivals: Option<String>,
) -> Result<CliResult, String> {
    let settings = settings_of(&state);
    let server = server::current()?;
    let args = settings_args(&settings, traffic, rivals.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || run_json(&server.path, &args, STATUS_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
}

/// Start `setup`, `serve` or `start` and stream its output as events.
/// The window passes what `version --json` lists: `events` for the JSON
/// event stream, `api` for the session API, which it then prefers.
#[tauri::command]
pub fn start_session(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    action: String,
    events: bool,
    api: bool,
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
    let stream = Stream::offered(events, api);
    let args = start_args(&settings, &action, stream)?;
    // With the API the session reports through it: its standard output
    // holds only `session` and `final`, and nothing it does depends on a
    // pipe this window owns.
    let mut child = command(&server.path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(if stream == Stream::Api {
            Stdio::null()
        } else {
            Stdio::piped()
        })
        .spawn()
        .map_err(|e| format!("Could not start the server: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    {
        let app = app.clone();
        std::thread::spawn(move || {
            pump_stdout(stdout, stream != Stream::Lines, |forward| {
                let _ = match forward {
                    Forward::Output(line) => app.emit("session-output", &line),
                    Forward::MapFeed(record) => app.emit("map-feed", &record),
                    Forward::Skip => Ok(()),
                };
            });
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            pump_stderr(stderr, |line| {
                let _ = app.emit("session-output", &line);
            });
        });
    }
    let stop_polling = Arc::new(AtomicBool::new(false));
    {
        let app = app.clone();
        let stop = Arc::clone(&stop_polling);
        let settings = settings.clone();
        if stream == Stream::Api {
            // The API's event stream brings every status once it is up.
            std::thread::spawn(move || crate::connection::await_api(&app, &settings, &stop));
        } else {
            std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    if let Ok(result) = status(&settings) {
                        let _ = app.emit("session-status", &result);
                    }
                    std::thread::sleep(Duration::from_millis(750));
                }
            });
        }
    }
    *guard = Some(RunningSession {
        action: action.clone(),
        child,
        stop_polling,
        api: stream == Stream::Api,
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
    fn settings_reads_without_options_and_saves_with_them() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/Afterhours")),
            ..Settings::default()
        };
        assert_eq!(
            settings_args(&settings, None, None).unwrap(),
            ["--json", "--data-dir", "D:/Afterhours", "settings"]
        );
        assert_eq!(
            settings_args(&settings, Some(200), None).unwrap()[4..],
            ["--traffic", "200"]
        );
        assert_eq!(
            settings_args(&settings, None, Some("original")).unwrap()[4..],
            ["--rivals", "original"]
        );
        assert_eq!(
            settings_args(&settings, Some(0), Some("0")).unwrap()[4..],
            ["--traffic", "0", "--rivals", "0"]
        );
        assert!(settings_args(&settings, None, Some("lots")).is_err());
        assert!(settings_args(&settings, None, Some("-1")).is_err());
    }

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

    fn text(text: &str) -> Forward {
        Forward::Output(OutputLine::Text { text: text.into() })
    }

    #[test]
    fn event_records_become_the_lines_the_human_stream_printed() {
        let status = r#"{"version":1,"utc":"2026-10-20T15:52:14Z","event":"status","status":{"version":1,"id":"0123456789abcdef0123456789abcdef","action":"serve","game_running":false,"utc":"2026-10-20T15:52:13Z","state":"ready","message":"Server listening.","worker_pid":1,"game_pid":null,"server_pid":2}}"#;
        assert_eq!(
            parse_event(status),
            Forward::Output(OutputLine::Status {
                time: "15:52:13".into(),
                state: "ready".into(),
                message: "Server listening.".into(),
            })
        );
        assert_eq!(
            parse_event(
                r#"{"version":1,"utc":"x","event":"diagnostic","source":"server","text":"2026-10-20T15:52:13.120Z  INFO listening"}"#
            ),
            text("2026-10-20T15:52:13.120Z  INFO listening")
        );
        assert_eq!(
            parse_event(
                r#"{"version":1,"utc":"x","event":"session","id":"0123456789abcdef0123456789abcdef","action":"serve","data_directory":"D:\\A","session_directory":"D:\\A\\artifacts\\launcher\\0123"}"#
            ),
            text("Session logs: D:\\A\\artifacts\\launcher\\0123")
        );
        assert_eq!(
            parse_event(
                r#"{"version":1,"utc":"2026-10-20T15:52:13Z","event":"final","exit_code":1,"message":"Installed file missing: NFS16.exe. Pass the directory containing NFS16.exe.","status":null}"#
            ),
            text("Installed file missing: NFS16.exe. Pass the directory containing NFS16.exe.")
        );
        assert_eq!(
            parse_event(
                r#"{"version":1,"utc":"x","event":"final","exit_code":0,"message":null,"status":null}"#
            ),
            Forward::Skip
        );
    }

    #[test]
    fn map_feed_records_are_forwarded_whole_and_unknown_events_skipped() {
        let feed = r#"{"version":1,"utc":"2026-10-20T15:52:13Z","event":"map-feed","frame":42,"skipped":0,"worlds":[{"connection":1,"persona_id":"1000000007","world_ms":81250,"drivers":[{"participant":1,"x":-1234.57,"y":12.35,"z":6543.21,"heading":90.5,"speed":12.35}],"traffic":[],"rivals":[],"traffic_ring":null,"omitted":0}]}"#;
        match parse_event(feed) {
            Forward::MapFeed(value) => {
                assert_eq!(value["frame"], 42);
                assert_eq!(value["worlds"][0]["drivers"][0]["heading"], 90.5);
            }
            other => panic!("{other:?}"),
        }
        // A newer server's event kind, and records this launcher cannot read.
        assert_eq!(
            parse_event(r#"{"version":1,"utc":"x","event":"lap","time":3}"#),
            Forward::Skip
        );
        assert_eq!(
            parse_event(r#"{"version":1,"event":"status","status":{"state":"ready"}}"#),
            Forward::Skip
        );
        assert_eq!(parse_event("   \r\n"), Forward::Skip);
        // Anything that is not an event record is shown, not lost.
        assert_eq!(parse_event("thread panicked\r\n"), text("thread panicked"));
        assert_eq!(parse_event("[1,2]"), text("[1,2]"));
    }

    #[test]
    fn a_status_without_a_readable_time_is_still_shown() {
        assert_eq!(
            clock_of(Some("2026-10-13T20:31:02.1234567+02:00")),
            Some("20:31:02".into())
        );
        assert_eq!(clock_of(Some("2026-10-13T2a:31:02Z")), None);
        assert_eq!(clock_of(Some("20:31:02")), None);
        assert_eq!(clock_of(Some("2026-10-13T20:31")), None);
        assert_eq!(clock_of(None), None);
        let odd = r#"{"version":1,"utc":"later","event":"status","status":{"utc":"soon","state":"failed","message":"Server exited."}}"#;
        assert_eq!(parse_event(odd), text("failed : Server exited."));
        let fallback = r#"{"version":1,"utc":"2026-10-20T01:02:03Z","event":"status","status":{"utc":"soon","state":"ready","message":"m"}}"#;
        assert!(
            matches!(parse_event(fallback), Forward::Output(OutputLine::Status { time, .. }) if time == "01:02:03")
        );
    }

    #[test]
    fn lines_are_read_whole_and_overlong_ones_left_out() {
        let read = |input: &[u8], max: usize| {
            let mut lines = Vec::new();
            read_lines(input, max, |line| lines.push(line));
            lines
        };
        assert_eq!(
            read(b"one\r\ntwo\n\nlast", 100),
            [
                Some("one".into()),
                Some("two".into()),
                Some(String::new()),
                Some("last".into())
            ]
        );
        assert_eq!(read(b"", 100), Vec::<Option<String>>::new());
        // Lines longer than the reader's own buffer still arrive whole.
        let long = "x".repeat(20_000);
        let input = format!("{long}\nshort\n{long}\nend\n");
        let kept = read(input.as_bytes(), 30_000);
        assert_eq!(kept[0].as_deref().map(str::len), Some(20_000));
        assert_eq!(kept.len(), 4);
        assert_eq!(
            read(input.as_bytes(), 10_000),
            [None, Some("short".into()), None, Some("end".into())]
        );
        assert_eq!(read(b"abcdef", 3), [None]);
        assert_eq!(read(b"abc\n", 3), [Some("abc".into())]);
    }

    #[test]
    fn stdout_is_read_as_events_only_in_event_mode() {
        let input = b"[20:31:02] ready : Server listening.\n{\"version\":1,\"utc\":\"2026-10-20T15:52:13Z\",\"event\":\"map-feed\",\"frame\":1,\"skipped\":0,\"worlds\":[]}\n";
        let mut human = Vec::new();
        pump_stdout(&input[..], false, |f| human.push(f));
        assert!(
            matches!(&human[0], Forward::Output(OutputLine::Status { state, .. }) if state == "ready")
        );
        assert!(matches!(
            &human[1],
            Forward::Output(OutputLine::Text { .. })
        ));
        let mut events = Vec::new();
        pump_stdout(&input[..], true, |f| events.push(f));
        assert_eq!(events[0], text("[20:31:02] ready : Server listening."));
        assert!(
            matches!(&events[1], Forward::MapFeed(value) if value["worlds"] == serde_json::json!([]))
        );
        let mut stderr = Vec::new();
        pump_stderr(&b"{\"event\":\"status\"}\n"[..], |l| stderr.push(l));
        assert_eq!(
            stderr,
            [OutputLine::Text {
                text: "{\"event\":\"status\"}".into()
            }]
        );
    }

    #[test]
    fn sessions_use_the_best_stream_the_server_offers() {
        let settings = Settings {
            game_dir: Some(PathBuf::from("/g")),
            data_dir: Some(PathBuf::from("/d")),
            ..Settings::default()
        };
        assert_eq!(Stream::offered(true, true), Stream::Api);
        assert_eq!(Stream::offered(false, true), Stream::Api);
        assert_eq!(Stream::offered(true, false), Stream::Events);
        assert_eq!(Stream::offered(false, false), Stream::Lines);
        assert_eq!(
            start_args(&settings, "serve", Stream::Api).unwrap(),
            ["--data-dir", "/d", "serve", "--game-dir", "/g", "--api"]
        );
        assert_eq!(
            start_args(&settings, "serve", Stream::Events).unwrap(),
            ["--data-dir", "/d", "serve", "--game-dir", "/g", "--events"]
        );
        assert_eq!(
            start_args(&settings, "start", Stream::Lines).unwrap(),
            ["--data-dir", "/d", "start", "--game-dir", "/g"]
        );
        assert!(
            !start_args(&settings, "setup", Stream::Api)
                .unwrap()
                .contains(&"--json".to_owned())
        );
        assert!(start_args(&Settings::default(), "serve", Stream::Api).is_err());
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

    /// A stand-in server's event stream read through a real pipe.
    fn pump_fake(fake: &Path, args: &[&str]) -> Vec<Forward> {
        let mut child = command(fake)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut forwarded = Vec::new();
        pump_stdout(child.stdout.take().unwrap(), true, |f| forwarded.push(f));
        child.wait().unwrap();
        forwarded
    }

    const FAKE_STATUS: &str = r#"{"version":1,"utc":"2026-10-20T15:52:13Z","event":"status","status":{"state":"ready","message":"Server listening.","utc":"2026-10-20T15:52:13Z"}}"#;
    const FAKE_FEED: &str = r#"{"version":1,"utc":"2026-10-20T15:52:14Z","event":"map-feed","frame":7,"skipped":2,"worlds":[]}"#;
    const FAKE_FINAL: &str = r#"{"version":1,"utc":"2026-10-20T15:52:15Z","event":"final","exit_code":0,"message":null,"status":null}"#;

    fn assert_fake_stream(forwarded: &[Forward]) {
        assert_eq!(forwarded.len(), 3, "{forwarded:?}");
        assert!(
            matches!(&forwarded[0], Forward::Output(OutputLine::Status { time, state, .. }) if time == "15:52:13" && state == "ready")
        );
        assert!(matches!(&forwarded[1], Forward::MapFeed(value) if value["skipped"] == 2));
        assert_eq!(forwarded[2], Forward::Skip);
    }

    #[cfg(unix)]
    #[test]
    fn a_session_event_stream_is_read_through_its_pipe() {
        use std::os::unix::fs::PermissionsExt;
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-events-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("Afterhours");
        let script =
            format!("#!/bin/sh\nprintf '%s\\n' '{FAKE_STATUS}' '{FAKE_FEED}' '{FAKE_FINAL}'\n");
        std::fs::write(&fake, script).unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_fake_stream(&pump_fake(&fake, &["serve", "--events"]));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_session_event_stream_is_read_through_its_pipe() {
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-events-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("fake-events.cmd");
        let script =
            format!("@echo off\r\necho {FAKE_STATUS}\r\necho {FAKE_FEED}\r\necho {FAKE_FINAL}\r\n");
        std::fs::write(&fake, script).unwrap();
        assert_fake_stream(&pump_fake(&fake, &["serve", "--events"]));
        std::fs::remove_dir_all(dir).unwrap();
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
