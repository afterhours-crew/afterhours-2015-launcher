// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Rust side of the launcher window.
//!
//! The window never talks to the game or the server itself. Everything
//! goes through `Afterhours.exe`, the single executable published by the
//! afterhours-2015 repository and bundled here at the exact release pinned
//! in `server-pin.json`: `check --json` for preflight, `status --json` for
//! the current session, `stop --json` to end it, and `setup`, `serve` or
//! `start` to run one. That keeps the safety logic (path rules, digests,
//! process ownership, routing) in one place, and the session supervisor in
//! its own process.
//!
//! [`pin`] and [`server`] decide which executable runs, [`cli`] runs it and
//! turns its output into events, [`settings`] stores the few things the
//! window remembers, [`data`] reads the data directory's session records and
//! copies saves aside, [`updates`] serves the updater's checks, [`reads`]
//! runs the read-only commands behind the profile and logs screens,
//! [`images`] runs `car-images` and scopes the asset protocol to its
//! folder, and [`detect`] guesses where the game is installed.

pub mod cli;
pub mod data;
pub mod detect;
pub mod images;
pub mod pin;
pub mod reads;
pub mod server;
pub mod settings;
pub mod updates;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// State shared by every command: settings and the running session, if any.
pub struct AppState {
    /// As saved. Read through [`AppState::settings`], which applies the
    /// game folder decision.
    pub settings: Mutex<settings::Settings>,
    pub session: Mutex<Option<cli::RunningSession>>,
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

    /// The settings in use, with the game folder decision applied.
    pub fn settings(&self) -> settings::Settings {
        let stored = self.settings.lock().map(|s| s.clone()).unwrap_or_default();
        settings::effective(&stored, &self.game_folder(&stored))
    }
}

/// Build and run the application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let settings = settings::load(app.handle())?;
            app.manage(AppState {
                settings: Mutex::new(settings),
                session: Mutex::new(None),
                launcher_dir: detect::launcher_dir(),
            });
            let state = app.state::<AppState>();
            images::allow(app.handle(), &state.settings());
            Ok(())
        })
        .on_window_event(|window, event| {
            // The session's front-end writes its progress to pipes this
            // process reads, and the supervisor inherits them. Closing the
            // window while it runs would break those pipes under a live
            // game, so the window stays until the session is stopped.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && let Some(state) = window.try_state::<AppState>()
                && let Ok(mut guard) = state.session.lock()
                && guard.as_mut().is_some_and(cli::RunningSession::is_running)
            {
                api.prevent_close();
                let _ = window.emit("close-blocked", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            detect::detect_game_dirs,
            cli::run_check,
            cli::session_status,
            cli::start_session,
            cli::stop_session,
            cli::play_game,
            images::car_images,
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
