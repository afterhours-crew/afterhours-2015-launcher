// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The window's connection to a server's session API (afterhours-2015
//! `--api`, capability `api`): the way the launcher follows and controls
//! its own server, as it would a server on another PC.
//!
//! The server answers plain HTTP/1.1 on `127.0.0.1`, one request per
//! connection: `GET /v1/status`, `POST /v1/stop` and `POST /v1/play` return
//! the same records as the matching commands, and `GET /v1/events` streams
//! the session's `event` records as server-sent events. Every request
//! carries the session's token, read from `api --json`. The event stream
//! becomes the window's usual events: `session-output` console lines,
//! `session-status` and `map-feed`. Nothing here depends on the server
//! process's pipes, so the session outlives a closed or crashed window and a
//! reopened one reconnects.

use crate::cli::{self, CliResult, Forward, OutputLine};
use serde::Deserialize;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

/// How long one request may take to connect, send and answer.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
/// Most bytes kept from one answer.
const MAX_RESPONSE: usize = 1024 * 1024;
/// Longest response head of the event stream.
const MAX_HEAD: usize = 8 * 1024;
/// How long the event stream may stay silent: the server sends a
/// keep-alive comment every 15 seconds.
pub const STREAM_IDLE: Duration = Duration::from_secs(40);

/// `api --json`: how to reach a session's API.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ApiRecord {
    pub version: u32,
    pub id: String,
    pub url: String,
    pub token: String,
}

/// Where a session's API answers, checked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    /// The session it serves.
    pub id: String,
    /// `127.0.0.1:<port>`.
    pub address: SocketAddr,
    pub token: String,
}

impl Endpoint {
    /// Accept only what the server writes today: `http://127.0.0.1:<port>`
    /// and a 64-character lowercase hexadecimal token. Other computers are
    /// not reached yet.
    pub fn from_record(record: &ApiRecord) -> Result<Self, String> {
        if record.version != 1 {
            return Err(format!(
                "Unknown session API record version {}.",
                record.version
            ));
        }
        let address: SocketAddr = record
            .url
            .strip_prefix("http://")
            .and_then(|rest| rest.parse().ok())
            .filter(|a: &SocketAddr| a.ip().is_loopback() && a.port() != 0)
            .ok_or_else(|| format!("The session API is not on this PC: {}.", record.url))?;
        let token_ok = record.token.len() == 64
            && record
                .token
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if !token_ok {
            return Err("The session API token is malformed.".into());
        }
        Ok(Self {
            id: record.id.clone(),
            address,
            token: record.token.clone(),
        })
    }

    fn head(&self, method: &str, path: &str) -> String {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            self.address, self.token
        )
    }

    fn connect(&self, read_timeout: Duration) -> std::io::Result<TcpStream> {
        let stream = TcpStream::connect_timeout(&self.address, REQUEST_TIMEOUT)?;
        stream.set_read_timeout(Some(read_timeout))?;
        stream.set_write_timeout(Some(REQUEST_TIMEOUT))?;
        Ok(stream)
    }

    /// One request; the answer's status code and body.
    pub fn request(&self, method: &str, path: &str) -> Result<Response, String> {
        let unreachable = |e: std::io::Error| format!("Could not reach your server: {e}");
        let mut stream = self.connect(REQUEST_TIMEOUT).map_err(unreachable)?;
        stream
            .write_all(self.head(method, path).as_bytes())
            .map_err(unreachable)?;
        let mut bytes = Vec::new();
        stream
            .take(MAX_RESPONSE as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(unreachable)?;
        if bytes.len() > MAX_RESPONSE {
            return Err("Your server's answer was too long.".into());
        }
        parse_response(&bytes)
    }

    /// `POST /v1/stop` or `/v1/play`, as the window's command result.
    pub fn command(&self, path: &str) -> Result<CliResult, String> {
        Ok(self.request("POST", path)?.into_result())
    }

    /// Open the event stream, positioned after its response head.
    pub fn open_events(&self) -> Result<BufReader<TcpStream>, String> {
        let unreachable = |e: std::io::Error| format!("Could not reach your server: {e}");
        let mut stream = self.connect(STREAM_IDLE).map_err(unreachable)?;
        stream
            .write_all(self.head("GET", "/v1/events").as_bytes())
            .map_err(unreachable)?;
        let mut reader = BufReader::new(stream);
        let mut head = Vec::new();
        while !head.ends_with(b"\r\n\r\n") {
            if head.len() >= MAX_HEAD {
                return Err("Your server's event stream did not start.".into());
            }
            let mut byte = [0u8; 1];
            match reader.read(&mut byte) {
                Ok(0) => return Err("Your server closed the event stream.".into()),
                Ok(_) => head.push(byte[0]),
                Err(e) => return Err(unreachable(e)),
            }
        }
        if parse_head(&head)?.status == 200 {
            return Ok(reader);
        }
        // A refusal: read its record for the reason.
        let mut answer = head;
        reader
            .take(MAX_RESPONSE as u64)
            .read_to_end(&mut answer)
            .map_err(unreachable)?;
        Err(parse_response(&answer)?.message())
    }
}

/// An answer from the session API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

impl Response {
    /// The `api-error` record's message, or a description of the status.
    pub fn message(&self) -> String {
        serde_json::from_slice::<serde_json::Value>(&self.body)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(str::to_owned))
            .unwrap_or_else(|| format!("Your server answered {}.", self.status))
    }

    /// As the window's command result: the record, or a refusal with the
    /// command's exit code (1 for a refused request, 5 otherwise).
    pub fn into_result(self) -> CliResult {
        if self.status == 200
            && let Ok(value) = serde_json::from_slice(&self.body)
        {
            return CliResult::Ok { value };
        }
        CliResult::Error {
            exit: if self.status == 409 { 1 } else { 5 },
            message: self.message(),
        }
    }
}

/// Parse an HTTP/1.1 response: its status line, headers and body (up to
/// `Content-Length` when given, else the rest).
pub fn parse_response(bytes: &[u8]) -> Result<Response, String> {
    let head = parse_head(bytes)?;
    let rest = &bytes[head.end..];
    let body = match head.length {
        Some(n) if n <= rest.len() => rest[..n].to_vec(),
        Some(_) => return Err("Your server's answer was cut short.".into()),
        None => rest.to_vec(),
    };
    Ok(Response {
        status: head.status,
        body,
    })
}

/// A response head: its status, `Content-Length` if given, and where the
/// body starts.
struct Head {
    status: u16,
    length: Option<usize>,
    end: usize,
}

fn parse_head(bytes: &[u8]) -> Result<Head, String> {
    let malformed = || "Your server's answer was not HTTP.".to_owned();
    let end = bytes
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(malformed)?;
    let head = std::str::from_utf8(&bytes[..end]).map_err(|_| malformed())?;
    let mut lines = head.split("\r\n");
    let status_line = lines.next().ok_or_else(malformed)?;
    let mut parts = status_line.splitn(3, ' ');
    let (Some(version), Some(code)) = (parts.next(), parts.next()) else {
        return Err(malformed());
    };
    if !version.starts_with("HTTP/1.") {
        return Err(malformed());
    }
    let status: u16 = code.parse().map_err(|_| malformed())?;
    let mut length = None;
    for line in lines {
        let (name, value) = line.split_once(':').ok_or_else(malformed)?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            length = Some(value.trim().parse::<usize>().map_err(|_| malformed())?);
        }
        if name.trim().eq_ignore_ascii_case("transfer-encoding") {
            return Err("Your server's answer used an encoding the launcher does not read.".into());
        }
    }
    Ok(Head {
        status,
        length,
        end: end + 4,
    })
}

/// Server-sent events, one line at a time.
#[derive(Debug, Default)]
pub struct EventParser {
    kind: Option<String>,
    data: Option<String>,
}

impl EventParser {
    /// Take one line without its line ending; a complete event at a blank
    /// line. Comments and fields other than `event` and `data` are skipped.
    pub fn line(&mut self, line: &str) -> Option<(String, String)> {
        if line.is_empty() {
            let kind = self.kind.take().unwrap_or_else(|| "message".into());
            return self.data.take().map(|data| (kind, data));
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => self.kind = Some(value.to_owned()),
            "data" => match self.data.as_mut() {
                Some(data) => {
                    data.push('\n');
                    data.push_str(value);
                }
                None => self.data = Some(value.to_owned()),
            },
            _ => {}
        }
        None
    }
}

/// What one event of the stream becomes for the window.
#[derive(Debug, Clone, PartialEq)]
pub enum WindowEvent {
    /// A `session-output` console line.
    Output(OutputLine),
    /// A `session-status` result: `{"version":1,"session":<status>}`, as
    /// `status --json` answers.
    Status(CliResult),
    /// A `map-feed` record.
    MapFeed(serde_json::Value),
}

/// Turn one streamed event record into window events. A status arrives as
/// a console line and as the session's new status; a status the stream
/// repeats (it starts with the newest one on every reconnect) adds no line.
pub fn window_events(kind: &str, data: &str, last_status: &mut Option<String>) -> Vec<WindowEvent> {
    let mut out = Vec::new();
    if kind == "status"
        && let Ok(record) = serde_json::from_str::<serde_json::Value>(data)
        && let Some(status) = record.get("status").filter(|s| s.is_object())
    {
        let key = status.to_string();
        let repeated = last_status.as_deref() == Some(key.as_str());
        *last_status = Some(key);
        if !repeated && let Forward::Output(line) = cli::parse_event(data) {
            out.push(WindowEvent::Output(line));
        }
        out.push(WindowEvent::Status(CliResult::Ok {
            value: serde_json::json!({"version": 1, "session": status}),
        }));
        return out;
    }
    match cli::parse_event(data) {
        Forward::Output(line) => out.push(WindowEvent::Output(line)),
        Forward::MapFeed(value) => out.push(WindowEvent::MapFeed(value)),
        Forward::Skip => {}
    }
    out
}

/// Read one opened event stream to its end, passing each event on. Lines
/// are bounded like the session's other output.
pub fn read_stream(
    reader: impl BufRead,
    last_status: &mut Option<String>,
    mut emit: impl FnMut(WindowEvent),
) {
    let mut parser = EventParser::default();
    cli::read_lines(reader, cli::MAX_SESSION_LINE, |line| {
        if let Some(line) = line
            && let Some((kind, data)) = parser.line(&line)
        {
            for event in window_events(&kind, &data, last_status) {
                emit(event);
            }
        }
    });
}

/// How long a new session may take to bring its API up: preflight and the
/// supervisor's start, before any preparation.
pub const API_WAIT: Duration = Duration::from_secs(120);
/// How long closing waits for the window's own server to stop.
pub const CLOSE_WAIT: Duration = Duration::from_secs(90);

/// The session the window follows through its API.
pub struct Live {
    pub endpoint: Endpoint,
    stop: Arc<AtomicBool>,
}

impl Drop for Live {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn send(app: &AppHandle, event: WindowEvent) {
    let _ = match event {
        WindowEvent::Output(line) => app.emit("session-output", &line),
        WindowEvent::Status(result) => app.emit("session-status", &result),
        WindowEvent::MapFeed(record) => app.emit("map-feed", &record),
    };
}

/// Whether the last status the stream sent is a session's end.
fn has_ended(last_status: &Option<String>) -> bool {
    last_status
        .as_deref()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
        .and_then(|status| status["state"].as_str().map(str::to_owned))
        .is_some_and(|state| matches!(state.as_str(), "finished" | "failed" | "interrupted"))
}

/// Whether a session's API still answers.
fn answers(endpoint: &Endpoint) -> bool {
    endpoint
        .request("GET", "/v1/status")
        .is_ok_and(|r| r.status == 200)
}

/// Follow a session through its API on a thread, replacing any earlier
/// connection, until the session ends.
pub fn follow(app: &AppHandle, endpoint: Endpoint) {
    let stop = Arc::new(AtomicBool::new(false));
    if let Some(state) = app.try_state::<crate::AppState>()
        && let Ok(mut current) = state.connection.lock()
    {
        *current = Some(Live {
            endpoint: endpoint.clone(),
            stop: Arc::clone(&stop),
        });
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last_status = None;
        loop {
            if let Ok(reader) = endpoint.open_events() {
                read_stream(reader, &mut last_status, |event| send(&app, event));
            }
            // The stream ends with the session; one that broke is reopened.
            if stop.load(Ordering::SeqCst) || has_ended(&last_status) || !answers(&endpoint) {
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        let Some(state) = app.try_state::<crate::AppState>() else {
            return;
        };
        if let Ok(mut current) = state.connection.lock()
            && current.as_ref().is_some_and(|l| l.endpoint == endpoint)
        {
            *current = None;
        }
        // The end state, also for a session this window did not start.
        if !stop.load(Ordering::SeqCst)
            && let Ok(result) = cli::status(&state.settings())
        {
            let _ = app.emit("session-status", &result);
        }
    });
}

/// After starting a session with `--api`: wait for its API, then follow
/// it. Gives up when the session's command exits (`stop`) or after
/// [`API_WAIT`].
pub fn await_api(app: &AppHandle, settings: &crate::settings::Settings, stop: &AtomicBool) {
    let deadline = Instant::now() + API_WAIT;
    while !stop.load(Ordering::SeqCst) && Instant::now() < deadline {
        if let Ok(Some(endpoint)) = cli::api_endpoint(settings) {
            follow(app, endpoint);
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Whether a `status --json` result names a session that is still live.
pub fn is_live(result: &CliResult) -> bool {
    let CliResult::Ok { value } = result else {
        return false;
    };
    let session = value.get("session").unwrap_or(value);
    matches!(
        session.get("state").and_then(|s| s.as_str()),
        Some("preparing" | "starting" | "activation" | "ready" | "stopping")
    )
}

/// What closing the window does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClosePlan {
    /// Nothing of the window's runs: close.
    Close,
    /// A session started without the API writes to this window's pipes:
    /// say so and stay open (servers without `api`).
    Refuse,
    /// The window's own server runs: stop it, wait, then close.
    StopThenClose,
    /// Already stopping to close: stay open until that ends.
    Wait,
}

/// Decide what closing does: `window_session` is the session this window
/// started, if it still runs, and whether it uses the API; `following` is
/// a session followed through its API.
pub fn close_plan(window_session: Option<bool>, following: bool, closing: bool) -> ClosePlan {
    match (closing, window_session, following) {
        (true, _, _) => ClosePlan::Wait,
        (false, Some(false), false) => ClosePlan::Refuse,
        (false, Some(_), _) | (false, None, true) => ClosePlan::StopThenClose,
        (false, None, false) => ClosePlan::Close,
    }
}

/// Stop the window's own server, wait until its session is over, then
/// close the app. If it does not stop within [`CLOSE_WAIT`], the window
/// stays open and says so.
pub fn stop_then_close(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(state) = app.try_state::<crate::AppState>() else {
            return;
        };
        let settings = state.settings();
        let deadline = Instant::now() + CLOSE_WAIT;
        let mut asked: Option<Instant> = None;
        loop {
            // Ask again every few seconds: a session that was still starting
            // may not have accepted the first request.
            if asked.is_none_or(|at| at.elapsed() > Duration::from_secs(3)) {
                let endpoint = state.endpoint();
                if endpoint.and_then(|e| e.command("/v1/stop").ok()).is_none() {
                    let _ = cli::stop(&settings);
                }
                asked = Some(Instant::now());
            }
            let window_done = !state.window_session_runs();
            let live = cli::status(&settings).is_ok_and(|r| is_live(&r));
            if window_done && !live {
                state.closing.store(false, Ordering::SeqCst);
                app.exit(0);
                return;
            }
            if Instant::now() > deadline {
                state.closing.store(false, Ordering::SeqCst);
                let _ = app.emit(
                    "close-failed",
                    "Your server did not stop in time, so the launcher stays open. Stop it on Host, then close again.",
                );
                return;
            }
            std::thread::sleep(Duration::from_millis(300));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// A whole answer, its body's length counted.
    fn answer(status: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    fn record(url: &str, token: &str) -> ApiRecord {
        ApiRecord {
            version: 1,
            id: "a".repeat(32),
            url: url.into(),
            token: token.into(),
        }
    }

    #[test]
    fn only_a_loopback_api_with_a_well_formed_token_is_reached() {
        let endpoint = Endpoint::from_record(&record("http://127.0.0.1:53111", TOKEN)).unwrap();
        assert_eq!(endpoint.address.to_string(), "127.0.0.1:53111");
        for url in [
            "https://127.0.0.1:53111",
            "http://192.168.1.5:53111",
            "http://example.com:80",
            "http://127.0.0.1:0",
            "http://127.0.0.1",
            "127.0.0.1:53111",
        ] {
            assert!(Endpoint::from_record(&record(url, TOKEN)).is_err(), "{url}");
        }
        for token in ["short", &TOKEN.to_uppercase(), &format!("{}g", &TOKEN[1..])] {
            assert!(Endpoint::from_record(&record("http://127.0.0.1:1", token)).is_err());
        }
        let mut newer = record("http://127.0.0.1:1", TOKEN);
        newer.version = 2;
        assert!(Endpoint::from_record(&newer).is_err());
    }

    #[test]
    fn responses_are_parsed_and_refusals_become_command_errors() {
        let ok = parse_response(
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"version\":1}\r\nextra",
        )
        .unwrap();
        assert_eq!(ok.status, 200);
        assert_eq!(ok.body, b"{\"version\":1}\r\n");
        assert!(matches!(ok.into_result(), CliResult::Ok { value } if value["version"] == 1));
        let refused = parse_response(&answer(
            "409 Conflict",
            r#"{"version":1,"message":"The game is running."}"#,
        ))
        .unwrap();
        assert!(matches!(
            refused.into_result(),
            CliResult::Error { exit: 1, message } if message == "The game is running."
        ));
        let odd = parse_response(b"HTTP/1.1 401 Unauthorized\r\n\r\n").unwrap();
        assert!(matches!(
            odd.into_result(),
            CliResult::Error { exit: 5, message } if message.contains("401")
        ));
        for bad in [
            &b"garbage"[..],
            b"SPDY/3 200 OK\r\n\r\n",
            b"HTTP/1.1 abc OK\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nno colon\r\n\r\n",
            b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort",
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
        ] {
            assert!(
                parse_response(bad).is_err(),
                "{}",
                String::from_utf8_lossy(bad)
            );
        }
    }

    #[test]
    fn server_sent_events_are_split_at_blank_lines() {
        let mut parser = EventParser::default();
        let mut events = Vec::new();
        for line in [
            ": keep-alive",
            "",
            "id: 4",
            "event: status",
            "data: {\"a\":1}",
            "",
            "data: first",
            "data: second",
            "retry: 10",
            "",
            "event: lonely",
            "",
        ] {
            if let Some(event) = parser.line(line) {
                events.push(event);
            }
        }
        assert_eq!(
            events,
            [
                ("status".to_owned(), "{\"a\":1}".to_owned()),
                ("message".to_owned(), "first\nsecond".to_owned()),
            ]
        );
    }

    fn status_event(state: &str, message: &str) -> String {
        serde_json::json!({
            "version": 1, "utc": "2026-10-20T12:00:01Z", "event": "status",
            "status": {"version": 1, "id": "a".repeat(32), "action": "serve", "game_running": false,
                       "utc": "2026-10-20T12:00:00Z", "state": state, "message": message,
                       "worker_pid": 1, "game_pid": null, "server_pid": 2}
        })
        .to_string()
    }

    #[test]
    fn stream_events_become_the_windows_events() {
        let mut last = None;
        let ready = status_event("ready", "Server listening.");
        let events = window_events("status", &ready, &mut last);
        assert_eq!(events.len(), 2);
        assert!(matches!(
            &events[0],
            WindowEvent::Output(OutputLine::Status { time, state, .. }) if time == "12:00:00" && state == "ready"
        ));
        assert!(matches!(
            &events[1],
            WindowEvent::Status(CliResult::Ok { value }) if value["version"] == 1 && value["session"]["state"] == "ready"
        ));
        // The stream repeats the newest status after a reconnect: no second line.
        let again = window_events("status", &ready, &mut last);
        assert!(matches!(again.as_slice(), [WindowEvent::Status(_)]));
        let diagnostic =
            r#"{"version":1,"utc":"x","event":"diagnostic","source":"server","text":"hello"}"#;
        assert_eq!(
            window_events("diagnostic", diagnostic, &mut last),
            [WindowEvent::Output(OutputLine::Text {
                text: "hello".into()
            })]
        );
        let feed =
            r#"{"version":1,"utc":"x","event":"map-feed","frame":3,"skipped":0,"worlds":[]}"#;
        assert!(matches!(
            window_events("map-feed", feed, &mut last).as_slice(),
            [WindowEvent::MapFeed(value)] if value["frame"] == 3
        ));
        assert!(window_events("lap", r#"{"event":"lap"}"#, &mut last).is_empty());
        assert!(window_events("status", "not json", &mut last).len() == 1);
    }

    /// A stand-in session API on a loopback port: answers each connection
    /// with `answer(request head)`, as many times as asked.
    fn fake_api(
        answers: usize,
        answer: impl Fn(&str) -> Vec<u8> + Send + 'static,
    ) -> (Endpoint, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            let mut heads = Vec::new();
            for _ in 0..answers {
                let (mut stream, _) = listener.accept().unwrap();
                let mut head = Vec::new();
                let mut byte = [0u8; 1];
                while !head.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    head.push(byte[0]);
                }
                let head = String::from_utf8(head).unwrap();
                stream.write_all(&answer(&head)).unwrap();
                heads.push(head);
            }
            heads
        });
        let endpoint = Endpoint {
            id: "a".repeat(32),
            address,
            token: TOKEN.into(),
        };
        (endpoint, handle)
    }

    #[test]
    fn requests_carry_the_token_and_host_and_read_the_answer() {
        let (endpoint, server) = fake_api(2, |head| {
            if head.starts_with("POST /v1/stop ") {
                answer("200 OK", r#"{"outcome":"requested"}"#)
            } else {
                // No length: the body runs to the end of the connection.
                b"HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n{\"version\":1,\"message\":\"No game here.\"}".to_vec()
            }
        });
        let stopped = endpoint.command("/v1/stop").unwrap();
        assert!(matches!(stopped, CliResult::Ok { value } if value["outcome"] == "requested"));
        let played = endpoint.command("/v1/play").unwrap();
        assert!(
            matches!(played, CliResult::Error { exit: 1, message } if message == "No game here.")
        );
        let heads = server.join().unwrap();
        for head in &heads {
            assert!(
                head.contains(&format!("Host: {}\r\n", endpoint.address)),
                "{head}"
            );
            assert!(head.contains(&format!("Authorization: Bearer {TOKEN}\r\n")));
        }
    }

    #[test]
    fn the_event_stream_is_read_to_its_end() {
        let ready = status_event("ready", "Server listening.");
        let finished = status_event("finished", "All done.");
        let (endpoint, server) = fake_api(1, move |_| {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n\
                 id: 0\nevent: status\ndata: {ready}\n\n: keep-alive\n\n\
                 id: 1\nevent: map-feed\ndata: {{\"version\":1,\"utc\":\"x\",\"event\":\"map-feed\",\"frame\":9,\"skipped\":0,\"worlds\":[]}}\n\n\
                 id: 2\nevent: status\ndata: {finished}\n\n"
            )
            .into_bytes()
        });
        let reader = endpoint.open_events().unwrap();
        let mut last = None;
        let mut events = Vec::new();
        read_stream(reader, &mut last, |e| events.push(e));
        server.join().unwrap();
        let kinds: Vec<&str> = events
            .iter()
            .map(|e| match e {
                WindowEvent::Output(_) => "output",
                WindowEvent::Status(_) => "status",
                WindowEvent::MapFeed(_) => "map-feed",
            })
            .collect();
        assert_eq!(kinds, ["output", "status", "map-feed", "output", "status"]);
    }

    #[test]
    fn a_refused_event_stream_says_why() {
        let (endpoint, server) = fake_api(1, |_| {
            answer(
                "503 Service Unavailable",
                r#"{"version":1,"message":"Too many event streams are open."}"#,
            )
        });
        let error = endpoint.open_events().unwrap_err();
        assert_eq!(error, "Too many event streams are open.");
        server.join().unwrap();
        let closed = Endpoint {
            address: "127.0.0.1:9".parse().unwrap(),
            ..endpoint
        };
        assert!(closed.request("GET", "/v1/status").is_err());
    }

    /// Against a real session started with `--api`: follow it, then stop it
    /// through its API. Not run by default; start one first, e.g.
    /// `Afterhours.exe --data-dir <D> serve --server-only --api --game-dir <G>`,
    /// then run with `AFTERHOURS_EXE` and `AFTERHOURS_E2E_DATA=<D>` set and
    /// `--ignored`.
    #[test]
    #[ignore = "needs a running server session"]
    fn a_real_session_is_followed_and_stopped_through_its_api() {
        let data = std::env::var_os("AFTERHOURS_E2E_DATA").expect("AFTERHOURS_E2E_DATA");
        let settings = crate::settings::Settings {
            data_dir: Some(data.into()),
            ..Default::default()
        };
        let endpoint = cli::api_endpoint(&settings)
            .unwrap()
            .expect("a live session serving the API");
        let status = endpoint.request("GET", "/v1/status").unwrap();
        assert_eq!(status.status, 200);
        let info = endpoint.request("GET", "/v1/info").unwrap().into_result();
        assert!(
            matches!(&info, CliResult::Ok { value } if value["capabilities"].as_array().unwrap().contains(&"api".into())),
            "{info:?}"
        );
        let reader = endpoint.open_events().unwrap();
        let stopper = {
            let endpoint = endpoint.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                endpoint.command("/v1/stop").unwrap()
            })
        };
        let mut last = None;
        let mut events = Vec::new();
        read_stream(reader, &mut last, |e| events.push(e));
        let stopped = stopper.join().unwrap();
        assert!(
            matches!(&stopped, CliResult::Ok { value } if value["outcome"] == "requested"),
            "{stopped:?}"
        );
        let states: Vec<String> = events
            .iter()
            .filter_map(|e| match e {
                WindowEvent::Status(CliResult::Ok { value }) => {
                    value["session"]["state"].as_str().map(str::to_owned)
                }
                _ => None,
            })
            .collect();
        eprintln!("states {states:?}, {} events", events.len());
        assert_eq!(states.first().map(String::as_str), Some("ready"));
        assert_eq!(states.last().map(String::as_str), Some("finished"));
        assert!(has_ended(&last), "the follower knows the session ended");
        // The supervisor closes its listener as it exits, just after the stream.
        let deadline = Instant::now() + Duration::from_secs(10);
        while answers(&endpoint) {
            assert!(Instant::now() < deadline, "the API outlived its session");
            std::thread::sleep(Duration::from_millis(100));
        }
        assert_eq!(cli::api_endpoint(&settings).unwrap(), None);
    }

    #[test]
    fn a_followed_session_ends_with_its_last_status() {
        let mut last = None;
        assert!(!has_ended(&last));
        for (state, ended) in [
            ("ready", false),
            ("stopping", false),
            ("finished", true),
            ("failed", true),
            ("interrupted", true),
        ] {
            window_events("status", &status_event(state, "m"), &mut last);
            assert_eq!(has_ended(&last), ended, "{state}");
        }
    }

    #[test]
    fn closing_stops_the_launchers_own_server_first() {
        use ClosePlan::*;
        // Nothing runs: close.
        assert_eq!(close_plan(None, false, false), Close);
        // The window's session through the API, or one it follows: stop it.
        assert_eq!(close_plan(Some(true), true, false), StopThenClose);
        assert_eq!(close_plan(Some(true), false, false), StopThenClose);
        assert_eq!(close_plan(None, true, false), StopThenClose);
        // A session on this window's pipes (no API): stay open and say so.
        assert_eq!(close_plan(Some(false), false, false), Refuse);
        // A second close while stopping waits.
        assert_eq!(close_plan(Some(true), true, true), Wait);
        assert_eq!(close_plan(None, false, true), Wait);
    }

    #[test]
    fn live_states_are_read_from_either_status_shape() {
        let v1 = |state: &str| CliResult::Ok {
            value: serde_json::json!({"version": 1, "session": {"state": state}}),
        };
        for state in ["preparing", "starting", "activation", "ready", "stopping"] {
            assert!(is_live(&v1(state)), "{state}");
        }
        for state in ["finished", "failed", "interrupted"] {
            assert!(!is_live(&v1(state)), "{state}");
        }
        assert!(!is_live(&CliResult::Ok {
            value: serde_json::json!({"version": 1, "session": null})
        }));
        assert!(is_live(&CliResult::Ok {
            value: serde_json::json!({"state": "ready"})
        }));
        assert!(!is_live(&CliResult::Error {
            exit: 4,
            message: "none".into()
        }));
    }
}
