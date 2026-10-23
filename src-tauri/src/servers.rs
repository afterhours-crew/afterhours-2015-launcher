// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Your servers: this PC's own and the ones on other PCs you paired with.
//!
//! The Server screen picks one of them, and the window then reaches it,
//! and only it, through its API: Play, World, Profile, Map and Logs all
//! follow the server in use. The list is kept in `servers.json` beside
//! `settings.json`, with what the launcher last saw of each server (its
//! version, its features, when it answered, when a game last played on it)
//! so a server that is off still shows what it was. The server in use is
//! mirrored into [`crate::settings::Settings::server`], which every command
//! already reads, so nothing else in the app changes shape.
//!
//! A server on another PC is added with its pairing code,
//! `<address>:<port>/<token>`, which that PC's own Server screen shows and
//! copies. Adding checks the server first (`GET /v1/info` with that token)
//! and says plainly what is wrong when it cannot be used. Every saved
//! server is checked again while the Server screen is open, a few seconds
//! each, so the list shows which ones answer right now.

use crate::{
    connection::{self, Endpoint},
    connlog,
    settings::{self, RemoteServer},
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

/// Beside `settings.json` in the app's config directory.
pub const FILE: &str = "servers.json";
/// Most servers kept; enough for every PC in a house.
pub const MAX_SERVERS: usize = 32;
/// Longest name a server may have, in characters.
pub const MAX_NAME: usize = 48;
/// How long a check of one server may take: connect, ask, answer.
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(2);
/// Adding a server waits a little longer: the person just typed it in.
pub const ADD_TIMEOUT: Duration = Duration::from_secs(5);
/// How long picking another server waits for this PC's own to stop.
pub const SWITCH_WAIT: Duration = Duration::from_secs(90);
/// The key the connection log uses for this PC's own server.
pub const THIS_PC: &str = "this-pc";

/// A server on another PC, as paired.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerEntry {
    /// 16 lowercase hexadecimal characters, chosen here when added; the
    /// key of its connection log.
    pub id: String,
    pub name: String,
    /// `http://<IPv4 address>:<port>`.
    pub url: String,
    /// Its API token, 64 lowercase hexadecimal characters.
    pub token: String,
    pub added_utc: String,
    /// When it last answered a check or a request, UTC.
    #[serde(default)]
    pub last_seen_utc: Option<String>,
    /// The program version it last reported, such as `0.4.1`.
    #[serde(default)]
    pub last_version: Option<String>,
    /// The capabilities it last reported.
    #[serde(default)]
    pub last_capabilities: Vec<String>,
    /// When a game last played on it from this PC, UTC.
    #[serde(default)]
    pub last_played_utc: Option<String>,
}

impl ServerEntry {
    /// The address people read: `192.168.1.32:61234`.
    pub fn address(&self) -> &str {
        self.url.strip_prefix("http://").unwrap_or(&self.url)
    }

    fn remote(&self) -> RemoteServer {
        RemoteServer {
            url: self.url.clone(),
            token: self.token.clone(),
        }
    }
}

/// What closing the launcher does while this PC's shared server runs.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseAction {
    /// Ask each time: keep it running for your other PCs, or stop it.
    #[default]
    Ask,
    Keep,
    Stop,
}

/// What the launcher remembers about this PC's own server.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ThisPc {
    /// When a game last played on it, UTC.
    pub last_played_utc: Option<String>,
}

/// `servers.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Servers {
    pub version: u32,
    pub servers: Vec<ServerEntry>,
    /// The entry in use; `None` is this PC's own server.
    pub in_use: Option<String>,
    pub close_action: CloseAction,
    pub this_pc: ThisPc,
}

impl Default for Servers {
    fn default() -> Self {
        Self {
            version: 1,
            servers: Vec::new(),
            in_use: None,
            close_action: CloseAction::Ask,
            this_pc: ThisPc::default(),
        }
    }
}

impl Servers {
    pub fn get(&self, id: &str) -> Option<&ServerEntry> {
        self.servers.iter().find(|s| s.id == id)
    }

    fn get_mut(&mut self, id: &str) -> Option<&mut ServerEntry> {
        self.servers.iter_mut().find(|s| s.id == id)
    }

    /// The server in use, when it is one on another PC.
    pub fn in_use_entry(&self) -> Option<&ServerEntry> {
        self.in_use.as_deref().and_then(|id| self.get(id))
    }

    /// The entry whose address or token matches `endpoint`.
    pub fn entry_for(&self, endpoint: &Endpoint) -> Option<&ServerEntry> {
        let url = format!("http://{}", endpoint.address);
        self.servers
            .iter()
            .find(|s| s.url == url || s.token == endpoint.token)
    }

    /// The pairing code of an entry, as it was pasted.
    pub fn pairing_code(entry: &ServerEntry) -> String {
        format!("{}/{}", entry.address(), entry.token)
    }
}

/// A pairing code or an address, as typed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pairing {
    /// `http://<IPv4 address>:<port>`.
    pub url: String,
    /// The token when the code carried one.
    pub token: Option<String>,
}

fn is_token(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Read a pairing code: `192.168.1.32:61234/<token>`, with or without
/// `http://`, the token after `/`, a space or a line break, or an address
/// alone. The address is checked as the connection does.
pub fn parse_pairing(text: &str) -> Result<Pairing, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Enter the server's pairing code, or its address and port.".into());
    }
    let rest = text.strip_prefix("http://").unwrap_or(text);
    let mut parts = rest.splitn(2, |c: char| c == '/' || c.is_whitespace());
    let address = parts.next().unwrap_or_default().trim();
    let token = parts
        .next()
        .map(|t| t.trim().trim_matches('/').to_owned())
        .filter(|t| !t.is_empty());
    let url = format!("http://{address}");
    Endpoint::from_record(&connection::ApiRecord {
        version: 1,
        id: String::new(),
        url: url.clone(),
        token: "0".repeat(64),
    })
    .map_err(|_| {
        "Enter the server's address and port, such as 192.168.1.20:61000, as its Server screen shows them.".to_owned()
    })?;
    if let Some(token) = &token
        && !is_token(token)
    {
        return Err("The pairing code's token should be 64 characters, 0-9 and a-f. Copy it again from that server's Server screen.".into());
    }
    Ok(Pairing { url, token })
}

/// A name as saved: trimmed, bounded, never empty (the address stands in).
pub fn clean_name(name: &str, address: &str) -> String {
    let name: String = name
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_NAME)
        .collect();
    if name.trim().is_empty() {
        address.to_owned()
    } else {
        name.trim().to_owned()
    }
}

fn new_id() -> Result<String, String> {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes).map_err(|e| format!("No random source: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn now_utc() -> String {
    connlog::now_iso()
}

pub(crate) fn file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    Ok(dir.join(FILE))
}

pub(crate) fn read(path: &Path) -> Servers {
    let mut servers: Servers = std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    servers.servers.truncate(MAX_SERVERS);
    if servers
        .in_use
        .as_deref()
        .is_some_and(|id| servers.get(id).is_none())
    {
        servers.in_use = None;
    }
    servers
}

pub(crate) fn write(path: &Path, servers: &Servers) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(servers).map_err(|e| e.to_string())?;
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())
}

/// Read the list at start-up. A `server` saved in `settings.json` by an
/// earlier launcher, before this list existed, becomes an entry in use.
pub fn load(app: &AppHandle, settings: &settings::Settings) -> Result<Servers, String> {
    let path = file(app)?;
    let mut servers = read(&path);
    if let Some(remote) = &settings.server
        && servers.in_use.is_none()
    {
        let known = servers
            .servers
            .iter()
            .find(|s| s.url == remote.url)
            .map(|s| s.id.clone());
        let id = match known {
            Some(id) => id,
            None => {
                let entry = entry_from(remote, None)?;
                let id = entry.id.clone();
                servers.servers.push(entry);
                id
            }
        };
        servers.in_use = Some(id);
        write(&path, &servers)?;
    }
    Ok(servers)
}

fn entry_from(remote: &RemoteServer, name: Option<&str>) -> Result<ServerEntry, String> {
    let address = remote
        .url
        .strip_prefix("http://")
        .unwrap_or(&remote.url)
        .to_owned();
    Ok(ServerEntry {
        id: new_id()?,
        name: clean_name(name.unwrap_or_default(), &address),
        url: remote.url.clone(),
        token: remote.token.clone(),
        added_utc: now_utc(),
        last_seen_utc: None,
        last_version: None,
        last_capabilities: Vec::new(),
        last_played_utc: None,
    })
}

/// What a check of a server found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum Reach {
    /// It answered with that token.
    Online {
        /// Its program version, such as `0.4.1`.
        version: String,
        release: String,
        capabilities: Vec<String>,
        /// Round trip of the info request, in milliseconds.
        ping_ms: u32,
        /// Its session's state, when it has one: `ready`, `preparing`…
        session: Option<String>,
        /// A game is playing on it right now.
        game_running: bool,
        /// How many saves it holds, when it told.
        saves: Option<u32>,
    },
    /// Nothing answered at that address in time.
    Unreachable { message: String },
    /// Something answered, but not with that token.
    Refused { message: String },
    /// An Afterhours server from before the session API.
    Older { message: String },
}

impl Reach {
    pub fn word(&self) -> &'static str {
        match self {
            Reach::Online { .. } => "online",
            Reach::Unreachable { .. } => "unreachable",
            Reach::Refused { .. } => "refused",
            Reach::Older { .. } => "older",
        }
    }
}

/// `GET /v1/info` and `GET /v1/status` of one server, within `wait`.
pub fn reach(endpoint: &Endpoint, wait: Duration) -> Reach {
    let started = Instant::now();
    let info = match endpoint.probe("/v1/info", wait) {
        Ok(answer) => answer,
        Err(message) => {
            return Reach::Unreachable {
                message: format!(
                    "Not reachable at {}. Is that PC on and serving? Windows may be blocking it. ({message})",
                    endpoint.address
                ),
            };
        }
    };
    let ping_ms = started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
    match info.status {
        200 => {}
        401 => {
            return Reach::Refused {
                message:
                    "That server refused the token. Copy a new pairing code from its Server screen."
                        .into(),
            };
        }
        403 => {
            return Reach::Refused {
                message: format!(
                    "That server answers another address than {}. Use the address its Server screen shows.",
                    endpoint.address
                ),
            };
        }
        404 => {
            return Reach::Older {
                message:
                    "That server has no session API, so the launcher cannot follow it. Update it to 0.4.1 or newer."
                        .into(),
            };
        }
        other => {
            return Reach::Unreachable {
                message: format!("That server answered {other} instead of its version."),
            };
        }
    }
    let value: serde_json::Value = match serde_json::from_slice(&info.body) {
        Ok(value) => value,
        Err(_) => {
            return Reach::Older {
                message: "That address answered, but not as an Afterhours server.".into(),
            };
        }
    };
    let version = value["program_version"]
        .as_str()
        .unwrap_or("unknown")
        .to_owned();
    let release = value["release"].as_str().unwrap_or("unknown").to_owned();
    let capabilities = value["capabilities"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|c| c.as_str().map(str::to_owned))
                .take(64)
                .collect()
        })
        .unwrap_or_default();
    // What it is doing, best effort: a server that answers info but not
    // status is still online.
    let (session, game_running) = endpoint
        .probe("/v1/status", wait)
        .ok()
        .filter(|r| r.status == 200)
        .and_then(|r| serde_json::from_slice::<serde_json::Value>(&r.body).ok())
        .map(|status| {
            let session = &status["session"];
            (
                session["state"].as_str().map(str::to_owned),
                session["game_running"].as_bool().unwrap_or(false),
            )
        })
        .unwrap_or((None, false));
    let saves = endpoint
        .probe("/v1/profiles", wait)
        .ok()
        .filter(|r| r.status == 200)
        .and_then(|r| serde_json::from_slice::<serde_json::Value>(&r.body).ok())
        .and_then(|list| list["accounts"].as_array().map(|a| a.len() as u32));
    Reach::Online {
        version,
        release,
        capabilities,
        ping_ms,
        session,
        game_running,
        saves,
    }
}

/// `server_check`: what the Add screen shows before saving.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServerCheck {
    pub url: String,
    pub address: String,
    #[serde(flatten)]
    pub reach: Reach,
    /// That is this PC's own server, already in the list.
    pub own: bool,
    /// It is already saved, under this name.
    pub known_as: Option<String>,
}

/// One saved server as the Server screen last saw it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServerHealth {
    pub id: String,
    #[serde(flatten)]
    pub reach: Reach,
    pub checked_utc: String,
}

fn servers_of(state: &State<'_, crate::AppState>) -> Servers {
    state.servers.lock().map(|s| s.clone()).unwrap_or_default()
}

/// Change the list and save it.
fn update(
    app: &AppHandle,
    state: &crate::AppState,
    change: impl FnOnce(&mut Servers) -> Result<(), String>,
) -> Result<Servers, String> {
    let mut current = state.servers.lock().map_err(|_| "servers state poisoned")?;
    let mut next = current.clone();
    change(&mut next)?;
    if next != *current {
        write(&file(app)?, &next)?;
        *current = next.clone();
    }
    Ok(next)
}

/// Remember what a server answered: version, features, when.
pub fn note_reach(app: &AppHandle, state: &crate::AppState, id: &str, reach: &Reach) {
    if let Reach::Online {
        version,
        capabilities,
        ..
    } = reach
    {
        let _ = update(app, state, |servers| {
            if let Some(entry) = servers.get_mut(id) {
                entry.last_seen_utc = Some(now_utc());
                entry.last_version = Some(version.clone());
                entry.last_capabilities = capabilities.clone();
            }
            Ok(())
        });
    }
}

/// A game is starting on the server in use: remember when.
pub fn note_played(app: &AppHandle, state: &crate::AppState) {
    let _ = update(app, state, |servers| {
        let now = Some(now_utc());
        match servers.in_use.clone() {
            Some(id) => {
                if let Some(entry) = servers.get_mut(&id) {
                    entry.last_played_utc = now;
                }
            }
            None => servers.this_pc.last_played_utc = now,
        }
        Ok(())
    });
}

/// The connection log key and name of the server an endpoint belongs to.
pub fn label_for(state: &crate::AppState, endpoint: &Endpoint) -> (String, String) {
    let settings = state.settings();
    if settings
        .local_api
        .as_ref()
        .is_some_and(|api| api.token == endpoint.token)
    {
        return (THIS_PC.to_owned(), "this PC".to_owned());
    }
    let servers = state.servers.lock().map(|s| s.clone()).unwrap_or_default();
    match servers.entry_for(endpoint) {
        Some(entry) => (entry.id.clone(), entry.name.clone()),
        None => (THIS_PC.to_owned(), endpoint.address.to_string()),
    }
}

/// The log key and name of the server in use.
pub fn in_use_label(state: &crate::AppState) -> (String, String) {
    let servers = state.servers.lock().map(|s| s.clone()).unwrap_or_default();
    match servers.in_use_entry() {
        Some(entry) => (entry.id.clone(), entry.name.clone()),
        None => (THIS_PC.to_owned(), "this PC".to_owned()),
    }
}

#[tauri::command]
pub fn servers_list(state: State<'_, crate::AppState>) -> Servers {
    servers_of(&state)
}

/// Check a server before it is saved: what answers at that pairing code.
#[tauri::command]
pub async fn server_check(
    state: State<'_, crate::AppState>,
    pairing: String,
) -> Result<ServerCheck, String> {
    let parsed = parse_pairing(&pairing)?;
    let token = parsed.token.clone().ok_or(
        "The pairing code has no token. Copy the whole code from that server's Server screen.",
    )?;
    let remote = RemoteServer {
        url: parsed.url.clone(),
        token,
    };
    let endpoint = Endpoint::remote(&remote)?;
    let settings = state.settings();
    let own = settings
        .local_api
        .as_ref()
        .is_some_and(|api| api.token == endpoint.token);
    let servers = servers_of(&state);
    let known_as = servers
        .servers
        .iter()
        .find(|s| s.url == remote.url)
        .map(|s| s.name.clone());
    let address = endpoint.address.to_string();
    let reach = tauri::async_runtime::spawn_blocking(move || reach(&endpoint, ADD_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?;
    Ok(ServerCheck {
        url: parsed.url,
        address,
        reach,
        own,
        known_as,
    })
}

/// Save a server from its pairing code, after a check that it answers;
/// then use it when `use_now`.
#[tauri::command]
pub async fn server_add(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    name: String,
    pairing: String,
    use_now: bool,
) -> Result<Servers, String> {
    let check = server_check(state.clone(), pairing.clone()).await?;
    if check.own {
        return Err("That is this PC's own server. It is already in the list.".into());
    }
    match &check.reach {
        Reach::Online { .. } => {}
        Reach::Unreachable { message } | Reach::Refused { message } | Reach::Older { message } => {
            return Err(message.clone());
        }
    }
    let parsed = parse_pairing(&pairing)?;
    let remote = RemoteServer {
        url: parsed.url,
        token: parsed.token.unwrap_or_default(),
    };
    let address = check.address.clone();
    let name = clean_name(&name, &address);
    let id = {
        let servers = servers_of(&state);
        match servers.servers.iter().find(|s| s.url == remote.url) {
            Some(known) => known.id.clone(),
            None => new_id()?,
        }
    };
    let entry_id = id.clone();
    let reach = check.reach.clone();
    let saved = update(&app, &state, |servers| {
        match servers.get_mut(&id) {
            // The same address again: a new token or name replaces the old.
            Some(entry) => {
                entry.name = name.clone();
                entry.token = remote.token.clone();
            }
            None => {
                if servers.servers.len() >= MAX_SERVERS {
                    return Err(format!(
                        "The list holds {MAX_SERVERS} servers. Forget one first."
                    ));
                }
                servers.servers.push(ServerEntry {
                    id: id.clone(),
                    name: name.clone(),
                    url: remote.url.clone(),
                    token: remote.token.clone(),
                    added_utc: now_utc(),
                    last_seen_utc: None,
                    last_version: None,
                    last_capabilities: Vec::new(),
                    last_played_utc: None,
                });
            }
        }
        Ok(())
    })?;
    note_reach(&app, &state, &entry_id, &reach);
    connlog::record(
        &app,
        &entry_id,
        &format!("Added {name} at {address}"),
        match &reach {
            Reach::Online { version, .. } => format!("version {version}"),
            _ => String::new(),
        },
    );
    if use_now {
        return server_use(app, state, Some(entry_id)).await;
    }
    Ok(saved)
}

/// Why this PC's server cannot be switched away from right now.
fn switch_blocker(state: &crate::AppState) -> Option<&'static str> {
    let game = crate::cli::status(&state.settings())
        .ok()
        .and_then(|result| match result {
            crate::cli::CliResult::Ok { value } => Some(value),
            _ => None,
        })
        .map(|value| value["session"]["game_running"].as_bool().unwrap_or(false))
        .unwrap_or(false);
    game.then_some("Close the game first; it is playing on this PC's server.")
}

/// Use a server: an entry by id, or this PC's own with `None`. This PC's
/// server keeps running when it is shared (your other PCs may be on it);
/// otherwise it is stopped first, because a game here can talk to one
/// server only. A game that is playing right now blocks the switch.
#[tauri::command]
pub async fn server_use(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    id: Option<String>,
) -> Result<Servers, String> {
    let settings = state.settings();
    let servers = servers_of(&state);
    let entry = match &id {
        Some(id) => Some(
            servers
                .get(id)
                .cloned()
                .ok_or("That server is no longer in the list.")?,
        ),
        None => None,
    };
    if servers.in_use == id {
        return Ok(servers);
    }
    // A game started here against another PC's server runs in this
    // window's session: switching under it would strand it.
    if settings.server.is_some() && state.window_session_runs() {
        return Err("Close the game first; it is playing on the server in use.".into());
    }
    if settings.server.is_none() && state.window_session_runs() {
        if let Some(why) = switch_blocker(&state) {
            return Err(why.into());
        }
        if settings.share_address.is_none() {
            let _ = app.emit("server-switching", "Stopping this PC's server…");
            let endpoint = state.endpoint().or_else(|| state.server_endpoint());
            let stopped = tauri::async_runtime::spawn_blocking({
                let app = app.clone();
                move || {
                    if endpoint.and_then(|e| e.command("/v1/stop").ok()).is_none() {
                        let _ = crate::cli::stop(&settings);
                    }
                    let state = app.state::<crate::AppState>();
                    let deadline = Instant::now() + SWITCH_WAIT;
                    while state.window_session_runs() {
                        if Instant::now() > deadline {
                            return false;
                        }
                        std::thread::sleep(Duration::from_millis(300));
                    }
                    true
                }
            })
            .await
            .map_err(|e| e.to_string())?;
            if !stopped {
                return Err(
                    "This PC's server did not stop in time. Stop it, then pick again.".into(),
                );
            }
            connlog::record(
                &app,
                THIS_PC,
                "Stopped this PC's server to switch",
                String::new(),
            );
        }
    }
    let remote = entry.as_ref().map(ServerEntry::remote);
    settings::write_server(&app, &state, remote)?;
    let saved = update(&app, &state, |servers| {
        servers.in_use = id.clone();
        Ok(())
    })?;
    match &entry {
        Some(entry) => connlog::record(
            &app,
            &entry.id,
            &format!("Picked {}", entry.name),
            entry.address().to_owned(),
        ),
        None => connlog::record(&app, THIS_PC, "Picked this PC's server", String::new()),
    }
    Ok(saved)
}

#[tauri::command]
pub fn server_rename(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    id: String,
    name: String,
) -> Result<Servers, String> {
    let mut before = String::new();
    let mut address = String::new();
    let saved = update(&app, &state, |servers| {
        let entry = servers
            .get_mut(&id)
            .ok_or("That server is no longer in the list.")?;
        before = entry.name.clone();
        address = entry.address().to_owned();
        entry.name = clean_name(&name, &address);
        Ok(())
    })?;
    if let Some(entry) = saved.get(&id)
        && entry.name != before
    {
        connlog::record(
            &app,
            &id,
            &format!("Renamed {before} to {}", entry.name),
            String::new(),
        );
    }
    Ok(saved)
}

/// Forget a server: its entry and its connection log. The server in use
/// cannot be forgotten; pick another first.
#[tauri::command]
pub fn server_forget(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Servers, String> {
    let saved = update(&app, &state, |servers| {
        if servers.in_use.as_deref() == Some(id.as_str()) {
            return Err("That server is in use. Pick another one first.".into());
        }
        let before = servers.servers.len();
        servers.servers.retain(|s| s.id != id);
        if servers.servers.len() == before {
            return Err("That server is no longer in the list.".into());
        }
        Ok(())
    })?;
    connlog::forget(&app, &id);
    Ok(saved)
}

/// A new pairing code for a saved server (its token changed there).
#[tauri::command]
pub async fn server_set_token(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    id: String,
    pairing: String,
) -> Result<Servers, String> {
    let parsed = parse_pairing(&pairing)?;
    let token = parsed.token.ok_or(
        "The pairing code has no token. Copy the whole code from that server's Server screen.",
    )?;
    let entry = servers_of(&state)
        .get(&id)
        .cloned()
        .ok_or("That server is no longer in the list.")?;
    if parsed.url != entry.url {
        return Err(format!(
            "That code is for {}, not {}. Add it as another server.",
            parsed.url.strip_prefix("http://").unwrap_or(&parsed.url),
            entry.address()
        ));
    }
    let remote = RemoteServer {
        url: entry.url.clone(),
        token: token.clone(),
    };
    let endpoint = Endpoint::remote(&remote)?;
    let reach = tauri::async_runtime::spawn_blocking(move || reach(&endpoint, ADD_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?;
    match &reach {
        Reach::Online { .. } => {}
        Reach::Unreachable { message } | Reach::Refused { message } | Reach::Older { message } => {
            return Err(message.clone());
        }
    }
    let saved = update(&app, &state, |servers| {
        if let Some(entry) = servers.get_mut(&id) {
            entry.token = token.clone();
        }
        Ok(())
    })?;
    note_reach(&app, &state, &id, &reach);
    // The server in use is reached with the new token from now on.
    if saved.in_use.as_deref() == Some(id.as_str()) {
        settings::write_server(&app, &state, Some(remote))?;
    }
    connlog::record(&app, &id, "New pairing code saved", String::new());
    Ok(saved)
}

/// Check every saved server at once, each within [`CHECK_TIMEOUT`], and
/// remember what answered. Changes of state go to each server's log.
#[tauri::command]
pub async fn servers_health(
    app: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<Vec<ServerHealth>, String> {
    let servers = servers_of(&state);
    let checks: Vec<(String, Endpoint)> = servers
        .servers
        .iter()
        .filter_map(|entry| {
            Endpoint::remote(&entry.remote())
                .ok()
                .map(|endpoint| (entry.id.clone(), endpoint))
        })
        .collect();
    let results = tauri::async_runtime::spawn_blocking(move || {
        let handles: Vec<_> = checks
            .into_iter()
            .map(|(id, endpoint)| std::thread::spawn(move || (id, reach(&endpoint, CHECK_TIMEOUT))))
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;
    let checked_utc = now_utc();
    let mut report = Vec::with_capacity(results.len());
    for (id, reach) in results {
        note_reach(&app, &state, &id, &reach);
        let changed = {
            let mut seen = state.health.lock().map_err(|_| "health state poisoned")?;
            let word = reach.word().to_owned();
            seen.insert(id.clone(), word.clone()) != Some(word)
        };
        if changed {
            let name = servers.get(&id).map(|e| e.name.clone()).unwrap_or_default();
            let (message, detail) = match &reach {
                Reach::Online {
                    version, ping_ms, ..
                } => (
                    format!("{name} answers · {version}"),
                    format!("{ping_ms} ms"),
                ),
                Reach::Unreachable { .. } => (format!("{name} is not reachable"), String::new()),
                Reach::Refused { .. } => (format!("{name} refused the token"), String::new()),
                Reach::Older { .. } => (format!("{name} is an older server"), String::new()),
            };
            connlog::record(&app, &id, &message, detail);
        }
        report.push(ServerHealth {
            id,
            reach,
            checked_utc: checked_utc.clone(),
        });
    }
    Ok(report)
}

#[tauri::command]
pub fn set_close_action(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    action: CloseAction,
) -> Result<Servers, String> {
    update(&app, &state, |servers| {
        servers.close_action = action;
        Ok(())
    })
}

/// The answer to "Keep your server running?": keep it and close, or stop
/// it first; `remember` saves the choice for next time.
#[tauri::command]
pub fn close_decision(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    keep: bool,
    remember: bool,
) -> Result<(), String> {
    if remember {
        set_close_action(
            app.clone(),
            state.clone(),
            if keep {
                CloseAction::Keep
            } else {
                CloseAction::Stop
            },
        )?;
    }
    if keep {
        connlog::record(
            &app,
            THIS_PC,
            "Launcher closed; the shared server keeps running",
            String::new(),
        );
        app.exit(0);
    } else {
        state
            .closing
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("closing", ());
        connection::stop_then_close(app.clone());
    }
    Ok(())
}

/// The connection log of one server (`None`: this PC's own), newest last.
#[tauri::command]
pub fn connection_log(app: AppHandle, id: Option<String>) -> Result<String, String> {
    let key = id.unwrap_or_else(|| THIS_PC.to_owned());
    if !connlog::is_key(&key) {
        return Err("Not a server.".into());
    }
    connlog::read(&app, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn pairing_codes_are_read_in_every_shape_they_are_pasted() {
        let whole = parse_pairing(&format!("192.168.1.32:61234/{TOKEN}")).unwrap();
        assert_eq!(whole.url, "http://192.168.1.32:61234");
        assert_eq!(whole.token.as_deref(), Some(TOKEN));
        for text in [
            format!("http://192.168.1.32:61234/{TOKEN}"),
            format!("  192.168.1.32:61234 {TOKEN}\n"),
            format!("192.168.1.32:61234/{TOKEN}/"),
            format!("192.168.1.32:61234\n{TOKEN}"),
        ] {
            assert_eq!(parse_pairing(&text).unwrap(), whole, "{text:?}");
        }
        let alone = parse_pairing("192.168.1.32:61234").unwrap();
        assert_eq!(alone.url, whole.url);
        assert_eq!(alone.token, None);
    }

    #[test]
    fn bad_codes_say_what_to_fix() {
        assert!(parse_pairing("").unwrap_err().contains("pairing code"));
        assert!(
            parse_pairing("garage-pc:61234")
                .unwrap_err()
                .contains("address")
        );
        assert!(
            parse_pairing("0.0.0.0:61234")
                .unwrap_err()
                .contains("address")
        );
        assert!(
            parse_pairing("192.168.1.32")
                .unwrap_err()
                .contains("address")
        );
        assert!(
            parse_pairing("192.168.1.32:61234/abc")
                .unwrap_err()
                .contains("64 characters")
        );
        assert!(
            parse_pairing(&format!("192.168.1.32:61234/{}", TOKEN.to_uppercase()))
                .unwrap_err()
                .contains("64 characters")
        );
    }

    #[test]
    fn names_are_trimmed_bounded_and_never_empty() {
        assert_eq!(clean_name("  Garage PC ", "1.2.3.4:5"), "Garage PC");
        assert_eq!(clean_name(" \t", "1.2.3.4:5"), "1.2.3.4:5");
        assert_eq!(clean_name("a\u{7}b", "x"), "ab");
        assert_eq!(clean_name(&"n".repeat(100), "x").chars().count(), MAX_NAME);
    }

    #[test]
    fn the_list_round_trips_and_tolerates_missing_or_broken_files() {
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-servers-{}", std::process::id()));
        let path = dir.join("nested").join(FILE);
        assert_eq!(read(&path), Servers::default());
        let servers = Servers {
            version: 1,
            servers: vec![ServerEntry {
                id: "0011223344556677".into(),
                name: "Garage PC".into(),
                url: "http://192.168.1.32:61234".into(),
                token: TOKEN.into(),
                added_utc: "2026-10-22T20:00:00Z".into(),
                last_seen_utc: Some("2026-10-22T20:01:00Z".into()),
                last_version: Some("0.4.1".into()),
                last_capabilities: vec!["api".into(), "play".into()],
                last_played_utc: None,
            }],
            in_use: Some("0011223344556677".into()),
            close_action: CloseAction::Keep,
            this_pc: ThisPc {
                last_played_utc: Some("2026-10-21T20:00:00Z".into()),
            },
        };
        write(&path, &servers).unwrap();
        assert_eq!(read(&path), servers);
        assert_eq!(
            Servers::pairing_code(&servers.servers[0]),
            format!("192.168.1.32:61234/{TOKEN}")
        );
        // An entry in use that is gone: nothing is in use.
        std::fs::write(&path, br#"{"version":1,"in_use":"deadbeefdeadbeef"}"#).unwrap();
        assert_eq!(read(&path).in_use, None);
        // Older or partial files fill in defaults: ask on close.
        let partial: Servers = serde_json::from_str(r#"{"servers":[]}"#).unwrap();
        assert_eq!(partial.close_action, CloseAction::Ask);
        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(read(&path), Servers::default());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_endpoint_is_matched_to_its_entry_by_address_or_token() {
        let entry = ServerEntry {
            id: "0011223344556677".into(),
            name: "Garage PC".into(),
            url: "http://192.168.1.32:61234".into(),
            token: TOKEN.into(),
            added_utc: String::new(),
            last_seen_utc: None,
            last_version: None,
            last_capabilities: Vec::new(),
            last_played_utc: None,
        };
        let servers = Servers {
            servers: vec![entry.clone()],
            ..Servers::default()
        };
        let same = Endpoint::remote(&entry.remote()).unwrap();
        assert_eq!(servers.entry_for(&same).map(|e| &e.id), Some(&entry.id));
        let moved = Endpoint::remote(&RemoteServer {
            url: "http://192.168.1.40:61234".into(),
            token: TOKEN.into(),
        })
        .unwrap();
        assert_eq!(servers.entry_for(&moved).map(|e| &e.id), Some(&entry.id));
        let other = Endpoint::remote(&RemoteServer {
            url: "http://192.168.1.40:61234".into(),
            token: "f".repeat(64),
        })
        .unwrap();
        assert_eq!(servers.entry_for(&other), None);
    }

    #[test]
    fn a_check_reads_what_the_server_answers() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut head = [0u8; 2048];
                let n = stream.read(&mut head).unwrap();
                let text = String::from_utf8_lossy(&head[..n]).into_owned();
                let body = if text.starts_with("GET /v1/info") {
                    r#"{"version":1,"program_version":"0.4.1","release":"v0.4.1","capabilities":["api","play"]}"#
                } else if text.starts_with("GET /v1/status") {
                    r#"{"version":1,"session":{"state":"ready","game_running":true}}"#
                } else {
                    r#"{"version":1,"accounts":[{"account_id":"a"},{"account_id":"b"}]}"#
                };
                let answer = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(answer.as_bytes()).unwrap();
            }
        });
        let endpoint = Endpoint::remote(&RemoteServer {
            url: format!("http://{address}"),
            token: TOKEN.into(),
        })
        .unwrap();
        let reach = reach(&endpoint, Duration::from_secs(5));
        server.join().unwrap();
        match reach {
            Reach::Online {
                version,
                release,
                capabilities,
                session,
                game_running,
                saves,
                ..
            } => {
                assert_eq!(version, "0.4.1");
                assert_eq!(release, "v0.4.1");
                assert_eq!(capabilities, vec!["api", "play"]);
                assert_eq!(session.as_deref(), Some("ready"));
                assert!(game_running);
                assert_eq!(saves, Some(2));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_refusal_an_old_server_and_silence_are_told_apart() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let answer = |status: &str| {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let status = status.to_owned();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut head = [0u8; 2048];
                let _ = stream.read(&mut head).unwrap();
                let body = r#"{"version":1,"message":"no"}"#;
                let answer = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(answer.as_bytes()).unwrap();
            });
            let endpoint = Endpoint::remote(&RemoteServer {
                url: format!("http://{address}"),
                token: TOKEN.into(),
            })
            .unwrap();
            let reach = reach(&endpoint, Duration::from_secs(5));
            server.join().unwrap();
            reach
        };
        assert!(matches!(answer("401 Unauthorized"), Reach::Refused { .. }));
        assert!(matches!(answer("403 Forbidden"), Reach::Refused { .. }));
        assert!(matches!(answer("404 Not Found"), Reach::Older { .. }));
        assert!(matches!(answer("500 Oops"), Reach::Unreachable { .. }));
        // Nothing listens: a bound then dropped port.
        let free = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let endpoint = Endpoint::remote(&RemoteServer {
            url: format!("http://{free}"),
            token: TOKEN.into(),
        })
        .unwrap();
        let silent = reach(&endpoint, Duration::from_millis(500));
        assert!(matches!(silent, Reach::Unreachable { .. }), "{silent:?}");
        assert_eq!(silent.word(), "unreachable");
    }
}
