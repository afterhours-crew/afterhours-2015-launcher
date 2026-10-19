// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Car pictures: running the server's `car-images` and letting the window
//! read what it writes.
//!
//! `car-images --json` decodes each car's in-game pictures from the player's
//! installation (read-only) into `<data>/artifacts/content/car-images/`, and
//! `profile --json` then names the PNG files. The window loads them through
//! Tauri's asset protocol. Its static scope in `tauri.conf.json` is empty;
//! [`allow`] adds exactly this one folder of the data directory in use, at
//! start-up and whenever the settings or the images change. Nothing else
//! on disk is readable through the protocol.

use crate::{
    cli::{self, CliResult},
    data, server,
    settings::Settings,
};
use std::{path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager, State};

/// Decoding takes seconds in a release build; the deadline leaves room for
/// a slow disk on the first run.
pub const CAR_IMAGES_TIMEOUT: Duration = Duration::from_secs(180);

/// `<data>/artifacts/content/car-images`, where the server writes the
/// decoded pictures; `None` without a data directory.
pub fn car_images_dir(settings: &Settings) -> Option<PathBuf> {
    data::data_dir(settings).map(|data| data.join("artifacts").join("content").join("car-images"))
}

/// Arguments for `car-images --json`: the chosen game folder when there is
/// one, else the server picks the current session's or the registered one.
pub fn car_images_args(settings: &Settings) -> Vec<String> {
    let mut args = cli::global_args(settings);
    args.push("car-images".into());
    if let Some(game) = &settings.game_dir {
        args.push("--game-dir".into());
        args.push(game.to_string_lossy().into_owned());
    }
    args
}

/// Let the asset protocol read the pictures folder of the data directory in
/// use, and nothing else.
pub fn allow(app: &AppHandle, settings: &Settings) {
    if let Some(dir) = car_images_dir(settings) {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

/// Run `car-images --json` and report its record or refusal. The window
/// calls this in the background when the server can and the profile has no
/// pictures yet; nothing waits on it.
#[tauri::command]
pub async fn car_images(
    app: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<CliResult, String> {
    let settings = state.settings();
    let server = server::current()?;
    let args = car_images_args(&settings);
    let result = tauri::async_runtime::spawn_blocking(move || {
        cli::run_json(&server.path, &args, CAR_IMAGES_TIMEOUT)
    })
    .await
    .map_err(|e| e.to_string())??;
    allow(&app, &settings);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pictures_folder_is_in_the_data_directory_content_cache() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/Afterhours")),
            ..Settings::default()
        };
        assert_eq!(
            car_images_dir(&settings),
            Some(PathBuf::from("D:/Afterhours/artifacts/content/car-images"))
        );
    }

    #[test]
    fn car_images_reads_the_chosen_game_folder_and_the_data_directory() {
        let settings = Settings {
            game_dir: Some(PathBuf::from("F:/EA Games/Need for Speed")),
            data_dir: Some(PathBuf::from("D:/Afterhours")),
            player_name: Some("Driver".into()),
            ..Settings::default()
        };
        assert_eq!(
            car_images_args(&settings),
            [
                "--json",
                "--data-dir",
                "D:/Afterhours",
                "car-images",
                "--game-dir",
                "F:/EA Games/Need for Speed",
            ]
        );
        // Without a chosen folder the server finds the game itself, and a
        // player name never goes to a command that creates no driver.
        let bare = Settings::default();
        let args = car_images_args(&bare);
        assert!(args.ends_with(&["car-images".to_owned()]));
        assert!(!args.iter().any(|a| a == "--player-name"));
    }
}
