// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Car pictures and the world map: running the server's `car-images` and
//! `map-images` and letting the window read what they write.
//!
//! `car-images --json` decodes each car's in-game pictures from the player's
//! installation (read-only) into `<data>/artifacts/content/car-images/`, and
//! `profile --json` then names the PNG files. `map-images --json` decodes the
//! game's world map into `<data>/artifacts/content/map-images/` and names its
//! tile folder and file pattern. The window loads both through Tauri's asset
//! protocol. Its static scope in `tauri.conf.json` is empty; [`allow`] adds
//! exactly these two folders of the data directory in use, at start-up and
//! whenever the settings or the images change. Nothing else on disk is
//! readable through the protocol.

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
/// The map's 1,344 tiles take about ten seconds in a release build.
pub const MAP_IMAGES_TIMEOUT: Duration = Duration::from_secs(180);

/// The file a `afterhours://` picture URL names: `content/<file>` after
/// percent-decoding, as `convertFileSrc` encodes it; `None` otherwise.
pub fn content_file(path: &str) -> Option<String> {
    let bytes = path.trim_start_matches('/').as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            decoded.push(bytes[i]);
            i += 1;
        }
    }
    let text = String::from_utf8(decoded).ok()?;
    let file = text.strip_prefix("content/")?;
    let safe = !file.is_empty()
        && file
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'-' | b'.' | b'_'))
        && !file.split('/').any(|part| part.is_empty() || part == "..");
    safe.then(|| file.to_owned())
}

/// The answer to an `afterhours://` request: the picture from the server's
/// API, or 404.
pub fn content_response(app: &AppHandle, path: &str) -> tauri::http::Response<Vec<u8>> {
    let missing = || {
        tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap_or_default()
    };
    let Some(file) = content_file(path) else {
        return missing();
    };
    let Some(endpoint) = app
        .try_state::<crate::AppState>()
        .and_then(|state| state.server_endpoint())
    else {
        return missing();
    };
    match endpoint.send_bounded(
        "GET",
        &format!("/v1/content/{file}"),
        &[],
        Duration::from_secs(30),
        MAX_PICTURE,
    ) {
        Ok(answer) if answer.status == 200 => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", "image/png")
            .body(answer.body)
            .unwrap_or_else(|_| missing()),
        _ => missing(),
    }
}

/// Longest picture or tile fetched from the server.
const MAX_PICTURE: usize = 16 * 1024 * 1024;

/// `<data>/artifacts/content/car-images`, where the server writes the
/// decoded pictures; `None` without a data directory.
pub fn car_images_dir(settings: &Settings) -> Option<PathBuf> {
    data::data_dir(settings).map(|data| data.join("artifacts").join("content").join("car-images"))
}

/// `<data>/artifacts/content/map-images`, where the server writes the decoded
/// world map; `None` without a data directory.
pub fn map_images_dir(settings: &Settings) -> Option<PathBuf> {
    data::data_dir(settings).map(|data| data.join("artifacts").join("content").join("map-images"))
}

/// Arguments for `car-images --json`: the chosen game folder when there is
/// one, else the server picks the current session's or the registered one.
pub fn car_images_args(settings: &Settings) -> Vec<String> {
    decode_args(settings, "car-images")
}

/// Arguments for `map-images --json`, chosen like [`car_images_args`].
pub fn map_images_args(settings: &Settings) -> Vec<String> {
    decode_args(settings, "map-images")
}

fn decode_args(settings: &Settings, command: &str) -> Vec<String> {
    let mut args = cli::global_args(settings);
    args.push(command.into());
    if let Some(game) = &settings.game_dir {
        args.push("--game-dir".into());
        args.push(game.to_string_lossy().into_owned());
    }
    args
}

/// Let the asset protocol read the pictures and map folders of the data
/// directory in use, and nothing else.
pub fn allow(app: &AppHandle, settings: &Settings) {
    for dir in [car_images_dir(settings), map_images_dir(settings)]
        .into_iter()
        .flatten()
    {
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
    if let Some(endpoint) = state.server_endpoint() {
        return through_api(endpoint, "/v1/car-images", CAR_IMAGES_TIMEOUT).await;
    }
    let settings = state.settings();
    let args = car_images_args(&settings);
    decode(app, settings, args, CAR_IMAGES_TIMEOUT).await
}

/// Run `map-images --json` and report its record or refusal. The Map view
/// calls this when it opens: a complete set comes back at once, the first
/// decode takes seconds.
#[tauri::command]
pub async fn map_images(
    app: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<CliResult, String> {
    if let Some(endpoint) = state.server_endpoint() {
        return through_api(endpoint, "/v1/map-images", MAP_IMAGES_TIMEOUT).await;
    }
    let settings = state.settings();
    let args = map_images_args(&settings);
    decode(app, settings, args, MAP_IMAGES_TIMEOUT).await
}

/// Decode through the server's API: its record, or why not.
async fn through_api(
    endpoint: crate::connection::Endpoint,
    path: &'static str,
    timeout: Duration,
) -> Result<CliResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        endpoint
            .run(path, timeout)
            .ok_or_else(|| "Your server is not running.".to_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn decode(
    app: AppHandle,
    settings: Settings,
    args: Vec<String>,
    timeout: Duration,
) -> Result<CliResult, String> {
    let server = server::current()?;
    let result =
        tauri::async_runtime::spawn_blocking(move || cli::run_json(&server.path, &args, timeout))
            .await
            .map_err(|e| e.to_string())??;
    allow(&app, &settings);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pictures_and_map_folders_are_in_the_data_directory_content_cache() {
        let settings = Settings {
            data_dir: Some(PathBuf::from("D:/Afterhours")),
            ..Settings::default()
        };
        assert_eq!(
            car_images_dir(&settings),
            Some(PathBuf::from("D:/Afterhours/artifacts/content/car-images"))
        );
        assert_eq!(
            map_images_dir(&settings),
            Some(PathBuf::from("D:/Afterhours/artifacts/content/map-images"))
        );
    }

    #[test]
    fn map_images_reads_the_chosen_game_folder_and_the_data_directory() {
        let settings = Settings {
            game_dir: Some(PathBuf::from("F:/EA Games/Need for Speed")),
            data_dir: Some(PathBuf::from("D:/Afterhours")),
            ..Settings::default()
        };
        assert_eq!(
            map_images_args(&settings),
            [
                "--json",
                "--data-dir",
                "D:/Afterhours",
                "map-images",
                "--game-dir",
                "F:/EA Games/Need for Speed",
            ]
        );
        assert!(map_images_args(&Settings::default()).ends_with(&["map-images".to_owned()]));
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

#[cfg(test)]
mod content_tests {
    use super::content_file;

    #[test]
    fn picture_urls_name_only_decoded_content() {
        let car = format!("car-images/{}/{}.png", "a".repeat(64), "b".repeat(40));
        let encoded = format!("/{}", format!("content/{car}").replace('/', "%2F"));
        assert_eq!(content_file(&encoded), Some(car.clone()));
        assert_eq!(content_file(&format!("/content/{car}")), Some(car));
        for bad in [
            "/content/",
            "/content%2F..%2Faccount.json",
            "/content/car-images//x.png",
            "/other/car-images/x.png",
            "/content/car%20images/x.png",
            "/content/%ZZ",
            "/content/a%2",
        ] {
            assert_eq!(content_file(bad), None, "{bad}");
        }
    }
}
