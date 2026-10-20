// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the game is. A guess, not a check: the command-line launcher's
//! `check` decides whether a directory is the supported build.
//!
//! A launcher copied into the game folder, next to `NFS16.exe` the way the
//! terminal `Afterhours.exe` is placed, uses that folder as the game folder
//! by itself. That folder only ever is read: settings, data and logs stay
//! where they always are. An installed launcher (per user, under
//! `%LOCALAPPDATA%`) never sits next to the game, so it finds the game in
//! the usual places or asks.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Executable that marks an installation directory.
pub const GAME_EXECUTABLE: &str = "NFS16.exe";

/// Directories where the EA app and Origin installed the game by default,
/// on each fixed drive letter.
fn candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if cfg!(windows) {
        for drive in ["C", "D", "E", "F", "G"] {
            for folder in [
                "Program Files\\EA Games\\Need for Speed",
                "Program Files (x86)\\Origin Games\\Need for Speed",
                "EA Games\\Need for Speed",
                "Origin Games\\Need for Speed",
                "Games\\Need for Speed",
            ] {
                out.push(PathBuf::from(format!("{drive}:\\{folder}")));
            }
        }
    }
    out
}

/// The folder holding this launcher's executable.
pub fn launcher_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
}

/// `dir` when it holds the game executable, as `exists` reports files.
pub fn game_in(dir: Option<&Path>, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    dir.filter(|dir| exists(&dir.join(GAME_EXECUTABLE)))
        .map(Path::to_path_buf)
}

/// Where the game folder in use comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GameSource {
    /// The launcher sits in the game folder; the saved setting is not used.
    LauncherFolder,
    /// The folder saved in settings (first run or Settings).
    Settings,
    /// None yet: the first run looks in the usual places and asks.
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GameFolder {
    pub path: Option<PathBuf>,
    pub source: GameSource,
}

/// The game folder to use: the launcher's own folder when it holds the
/// game, else the saved one, else none. While the launcher is in a game
/// folder that folder wins over a saved setting, which is kept for when
/// the launcher runs from elsewhere again.
pub fn game_folder(
    launcher_dir: Option<&Path>,
    saved: Option<&Path>,
    exists: impl Fn(&Path) -> bool,
) -> GameFolder {
    if let Some(path) = game_in(launcher_dir, exists) {
        return GameFolder {
            path: Some(path),
            source: GameSource::LauncherFolder,
        };
    }
    match saved {
        Some(path) => GameFolder {
            path: Some(path.to_path_buf()),
            source: GameSource::Settings,
        },
        None => GameFolder {
            path: None,
            source: GameSource::None,
        },
    }
}

/// Folders holding the game, the launcher's own folder first, then the
/// usual places, each once.
pub fn search(
    launcher_dir: Option<&Path>,
    usual: impl IntoIterator<Item = PathBuf>,
    exists: impl Fn(&Path) -> bool,
) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = game_in(launcher_dir, &exists).into_iter().collect();
    for dir in usual {
        if !found.contains(&dir) && exists(&dir.join(GAME_EXECUTABLE)) {
            found.push(dir);
        }
    }
    found
}

#[tauri::command]
pub fn detect_game_dirs() -> Vec<PathBuf> {
    search(launcher_dir().as_deref(), candidates(), Path::is_file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// A file-exists probe over a fixed set of paths.
    fn files(paths: &[&str]) -> impl Fn(&Path) -> bool + use<> {
        let set: HashSet<PathBuf> = paths.iter().map(PathBuf::from).collect();
        move |path: &Path| set.contains(path)
    }

    fn game(dir: &str) -> String {
        Path::new(dir).join(GAME_EXECUTABLE).display().to_string()
    }

    #[test]
    fn a_launcher_in_the_game_folder_uses_it() {
        let dir = Path::new("G:/Need for Speed");
        let exists = files(&[&game("G:/Need for Speed")]);
        assert_eq!(
            game_folder(Some(dir), None, &exists),
            GameFolder {
                path: Some(dir.to_path_buf()),
                source: GameSource::LauncherFolder,
            }
        );
    }

    #[test]
    fn a_launcher_elsewhere_uses_the_saved_folder_or_none() {
        let installed = Path::new("C:/Users/d/AppData/Local/Programs/Afterhours");
        let saved = Path::new("F:/EA Games/Need for Speed");
        let exists = files(&[&game("F:/EA Games/Need for Speed")]);
        assert_eq!(
            game_folder(Some(installed), Some(saved), &exists),
            GameFolder {
                path: Some(saved.to_path_buf()),
                source: GameSource::Settings,
            }
        );
        assert_eq!(
            game_folder(Some(installed), None, &exists).source,
            GameSource::None
        );
        assert_eq!(game_folder(None, None, &exists).source, GameSource::None);
    }

    #[test]
    fn a_folder_without_the_game_executable_is_not_the_game() {
        let dir = Path::new("D:/Games/Need for Speed");
        // Other files of the game are there, NFS16.exe is not.
        let exists = files(&["D:/Games/Need for Speed/Afterhours.exe"]);
        assert_eq!(game_in(Some(dir), &exists), None);
        assert_eq!(
            game_folder(Some(dir), None, &exists).source,
            GameSource::None
        );
    }

    #[test]
    fn the_launcher_folder_wins_over_a_different_saved_setting() {
        let dir = Path::new("G:/Need for Speed");
        let saved = Path::new("F:/EA Games/Need for Speed");
        let exists = files(&[
            &game("G:/Need for Speed"),
            &game("F:/EA Games/Need for Speed"),
        ]);
        let chosen = game_folder(Some(dir), Some(saved), &exists);
        assert_eq!(chosen.path.as_deref(), Some(dir));
        assert_eq!(chosen.source, GameSource::LauncherFolder);
    }

    #[test]
    fn the_search_tries_the_launcher_folder_first_then_the_usual_places_once() {
        let dir = PathBuf::from("G:/Need for Speed");
        let usual = vec![
            PathBuf::from("C:/EA Games/Need for Speed"),
            dir.clone(),
            PathBuf::from("F:/EA Games/Need for Speed"),
        ];
        let exists = files(&[
            &game("G:/Need for Speed"),
            &game("F:/EA Games/Need for Speed"),
        ]);
        assert_eq!(
            search(Some(&dir), usual.clone(), &exists),
            vec![dir.clone(), PathBuf::from("F:/EA Games/Need for Speed")]
        );
        let elsewhere = Path::new("C:/Programs/Afterhours");
        assert_eq!(
            search(Some(elsewhere), usual, &exists),
            vec![dir, PathBuf::from("F:/EA Games/Need for Speed")]
        );
    }

    #[test]
    fn only_directories_with_the_executable_are_reported() {
        let base =
            std::env::temp_dir().join(format!("afterhours-gui-detect-{}", std::process::id()));
        let with = base.join("with");
        let without = base.join("without");
        std::fs::create_dir_all(&with).unwrap();
        std::fs::create_dir_all(&without).unwrap();
        std::fs::write(with.join(GAME_EXECUTABLE), b"x").unwrap();
        let found = search(
            Some(&without),
            [with.clone(), without.clone(), base.join("missing")],
            Path::is_file,
        );
        assert_eq!(found, vec![with.clone()]);
        assert_eq!(game_in(Some(&with), Path::is_file), Some(with));
        std::fs::remove_dir_all(base).unwrap();
    }
}
