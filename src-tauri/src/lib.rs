// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Rust side of the launcher window.
//!
//! The window never talks to the game itself. Everything goes through
//! `Afterhours.exe`, the single executable published by the afterhours-2015
//! repository and bundled here at the exact release pinned in
//! `server-pin.json`: `check --json` for preflight, `status --json` for the
//! current session, `stop --json` to end it, and `setup`, `serve` or `start`
//! to run one. A server that reports `api` serves its session over HTTP on
//! this PC, and the window follows and stops it there, as it would a server
//! on another PC. That keeps the safety logic (path rules, digests, process
//! ownership, routing) in one place, and the session supervisor in its own
//! process.
//!
//! [`pin`] and [`server`] decide which executable runs, [`cli`] runs it and
//! turns its output into events, [`connection`] follows a session through
//! its API and stops it when the window closes, [`settings`] stores the few things the
//! window remembers, [`data`] reads the data directory's session records and
//! copies saves aside, [`updates`] serves the updater's checks, [`reads`]
//! runs the read-only commands behind the profile and logs screens,
//! [`images`] runs `car-images` and `map-images` and scopes the asset
//! protocol to their folders, and [`detect`] guesses where the game is installed. The window's
//! size, position and maximized state are remembered separately (see
//! [`WINDOW_STATE_FILE`]).

pub mod cli;
pub mod connection;
pub mod data;
pub mod detect;
pub mod images;
pub mod pin;
pub mod reads;
pub mod server;
pub mod settings;
pub mod updates;

use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::StateFlags;

/// Where the window's size, position and maximized state are kept between
/// runs, beside `settings.json` in the app's config directory. Not part of
/// [`settings::Settings`]: the window saves those whole, from its own copy.
/// The window starts hidden and is shown once restored, so it never jumps
/// from the default size; a remembered position that is on no connected
/// monitor any more is left to the system.
pub const WINDOW_STATE_FILE: &str = "window.json";

/// State shared by every command: settings and the running session, if any.
pub struct AppState {
    /// As saved. Read through [`AppState::settings`], which applies the
    /// game folder decision.
    pub settings: Mutex<settings::Settings>,
    pub session: Mutex<Option<cli::RunningSession>>,
    /// The session followed through its API, this window's own or one it
    /// found running.
    pub connection: Mutex<Option<connection::Live>>,
    /// Closing waits for the window's own server to stop.
    pub closing: AtomicBool,
    /// The folder holding this launcher's executable.
    pub launcher_dir: Option<std::path::PathBuf>,
}

impl AppState {
    /// Where the game folder in use comes from, for these saved settings:
    /// the launcher's own folder when it holds `NFS16.exe` (a copy placed in
    /// the game folder), else the saved one. The folder is only read.
    pub fn game_folder(&self, stored: &settings::Settings) -> detect::GameFolder {
        detect::game_folder(
            self.launcher_dir.as_deref(),
            stored.game_dir.as_deref(),
            std::path::Path::is_file,
        )
    }

    /// Where the followed session's API answers, if one is followed.
    pub fn endpoint(&self) -> Option<connection::Endpoint> {
        self.connection
            .lock()
            .ok()?
            .as_ref()
            .map(|live| live.endpoint.clone())
    }

    /// The server the window reaches by address and token: another PC's,
    /// or this PC's own once the launcher has started it with the API.
    /// While there is one, the window asks it everything and runs no
    /// command and reads no server file.
    pub fn server_endpoint(&self) -> Option<connection::Endpoint> {
        let settings = self.settings();
        match (&settings.server, &settings.local_api) {
            (Some(remote), _) => connection::Endpoint::remote(remote).ok(),
            (None, Some(api)) => Some(connection::Endpoint::local(api)),
            (None, None) => None,
        }
    }

    /// Whether the session this window started still runs, and if so
    /// whether it reports through the API.
    pub fn window_session(&self) -> Option<bool> {
        let mut guard = self.session.lock().ok()?;
        let running = guard.as_mut()?;
        running.is_running().then_some(running.api)
    }

    /// Whether the session this window started still runs.
    pub fn window_session_runs(&self) -> bool {
        self.window_session().is_some()
    }

    /// The settings in use, with the game folder decision applied.
    pub fn settings(&self) -> settings::Settings {
        let stored = self.settings.lock().map(|s| s.clone()).unwrap_or_default();
        settings::effective(&stored, &self.game_folder(&stored))
    }
}

/// Build and run the application.
pub fn run() {
    tauri::Builder::default()
        // Pictures and map tiles from the server's API (`GET /v1/content`).
        .register_asynchronous_uri_scheme_protocol("afterhours", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_owned();
            std::thread::spawn(move || responder.respond(images::content_response(&app, &path)));
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_filename(WINDOW_STATE_FILE)
                .build(),
        )
        .setup(|app| {
            // Created hidden and already restored by the window-state plugin.
            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }
            let settings = settings::load(app.handle())?;
            app.manage(AppState {
                settings: Mutex::new(settings),
                session: Mutex::new(None),
                connection: Mutex::new(None),
                closing: AtomicBool::new(false),
                launcher_dir: detect::launcher_dir(),
            });
            let state = app.state::<AppState>();
            images::allow(app.handle(), &state.settings());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the launcher stops its own server: it asks the session
            // to stop through its API, waits until it is over, then closes.
            // A session started without the API writes to pipes this process
            // reads, and breaking them could end a live game, so then the
            // window stays until the session is stopped.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && let Some(state) = window.try_state::<AppState>()
            {
                // Only this PC's own server is stopped on close.
                let plan = connection::close_plan(
                    state.window_session(),
                    state.endpoint().is_some_and(|e| e.is_local()),
                    state.closing.load(Ordering::SeqCst),
                );
                match plan {
                    connection::ClosePlan::Close => {}
                    connection::ClosePlan::Refuse => {
                        api.prevent_close();
                        let _ = window.emit("close-blocked", ());
                    }
                    connection::ClosePlan::Wait => api.prevent_close(),
                    connection::ClosePlan::StopThenClose => {
                        api.prevent_close();
                        state.closing.store(true, Ordering::SeqCst);
                        let _ = window.emit("closing", ());
                        connection::stop_then_close(window.app_handle().clone());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::set_server,
            settings::set_sharing,
            detect::detect_game_dirs,
            cli::run_check,
            cli::session_status,
            cli::start_session,
            cli::stop_session,
            cli::play_game,
            cli::connect_session,
            cli::world_settings,
            images::car_images,
            images::map_images,
            data::recorded,
            data::open_folder,
            updates::session_activity,
            updates::backup_saves,
            updates::app_info,
            reads::profile,
            reads::profile_list,
            reads::sessions,
            reads::session_file,
            reads::open_session_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Afterhours launcher");
}
