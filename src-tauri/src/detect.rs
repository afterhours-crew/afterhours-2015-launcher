// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the game usually is. A guess, not a check: the command-line
//! launcher's `check` decides whether a directory is the supported build.

use std::path::PathBuf;

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

/// Existing candidate directories that contain the game executable.
pub fn find_installed(extra: &[PathBuf]) -> Vec<PathBuf> {
    candidates()
        .into_iter()
        .chain(extra.iter().cloned())
        .filter(|dir| dir.join(GAME_EXECUTABLE).is_file())
        .collect()
}

#[tauri::command]
pub fn detect_game_dirs() -> Vec<PathBuf> {
    find_installed(&[])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_directories_with_the_executable_are_reported() {
        let base =
            std::env::temp_dir().join(format!("afterhours-gui-detect-{}", std::process::id()));
        let with = base.join("with");
        let without = base.join("without");
        std::fs::create_dir_all(&with).unwrap();
        std::fs::create_dir_all(&without).unwrap();
        std::fs::write(with.join(GAME_EXECUTABLE), b"x").unwrap();
        let found = find_installed(&[with.clone(), without, base.join("missing")]);
        assert_eq!(found, vec![with]);
        std::fs::remove_dir_all(base).unwrap();
    }
}
