// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Rust side of the launcher window.
//!
//! The window never talks to the game or the server itself. Everything
//! goes through `nfs-afterhours`, the command-line launcher from the
//! afterhours-2015 repository: `check --json` for preflight, `status --json`
//! for the current session, `stop --json` to end it, and `setup`, `serve`
//! or `start` to run one. That keeps the safety logic (path rules, digests,
//! process ownership, routing) in one place, and the session supervisor in
//! its own process, so closing this window never kills a running game.
//!
//! [`cli`] locates and runs the command-line launcher and turns its output
//! into events, [`settings`] stores the few things the window remembers,
//! and [`detect`] guesses where the game is installed.

pub mod cli;
pub mod detect;
pub mod settings;

use std::sync::Mutex;

/// State shared by every command: settings and the running session, if any.
pub struct AppState {
    pub settings: Mutex<settings::Settings>,
    pub session: Mutex<Option<cli::RunningSession>>,
}

/// Build and run the application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = settings::load(app.handle())?;
            app.manage(AppState {
                settings: Mutex::new(settings),
                session: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            detect::detect_game_dirs,
            cli::locate_cli,
            cli::run_check,
            cli::session_status,
            cli::start_session,
            cli::stop_session,
            cli::session_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Afterhours launcher");
}

use tauri::Manager;
