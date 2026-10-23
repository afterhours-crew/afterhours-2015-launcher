// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The launcher's own log of what happened with each server: picked,
//! connected (with the version and ping), token refused, not reachable,
//! stop sent, a game started. One file per server under `servers/` in the
//! app's config directory, keyed by the entry's id (`this-pc` for this
//! PC's own), newest last, bounded. Each line goes to the window as well,
//! as a `Launcher` row of the Server screen's log.

use crate::{cli::OutputLine, data};
use std::{path::PathBuf, time::SystemTime};
use tauri::{AppHandle, Emitter, Manager};

/// The folder under the app's config directory.
pub const DIR: &str = "servers";
/// Most bytes a server's log holds; over it the oldest lines go.
pub const MAX_BYTES: u64 = 1024 * 1024;
/// What is kept when the log is trimmed.
pub const KEEP_BYTES: usize = 768 * 1024;
/// Most characters of one line's message and detail.
const MAX_TEXT: usize = 400;
/// Most bytes read back for the Logs screen.
pub const MAX_READ: u64 = MAX_BYTES;

/// A log key: an entry id or `this-pc`.
pub fn is_key(key: &str) -> bool {
    key == crate::servers::THIS_PC
        || (key.len() == 16
            && key
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}

fn path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if !is_key(key) {
        return Err("Not a server.".into());
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    Ok(dir.join(DIR).join(format!("{key}.log")))
}

fn clean(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT)
        .collect()
}

/// `HH:MM:SS` of a UTC stamp, as the console rows show it.
fn clock_of(utc: &str) -> String {
    utc.get(11..19).unwrap_or("").to_owned()
}

/// Now, UTC, as `2026-10-23T07:37:14Z`: the form the server's own records
/// use, which the screens' date formatting reads.
pub fn now_iso() -> String {
    let compact = data::utc_stamp(SystemTime::now());
    match (
        compact.get(0..4),
        compact.get(4..6),
        compact.get(6..8),
        compact.get(9..11),
        compact.get(11..13),
        compact.get(13..15),
    ) {
        (Some(y), Some(mo), Some(d), Some(h), Some(mi), Some(s)) => {
            format!("{y}-{mo}-{d}T{h}:{mi}:{s}Z")
        }
        _ => compact,
    }
}

/// One line as stored: `<utc>\t<message>\t<detail>`.
pub fn format_line(utc: &str, message: &str, detail: &str) -> String {
    format!("{utc}\t{}\t{}\n", clean(message), clean(detail))
}

/// Append one line, trimming the file when it is over the bound.
pub fn append(path: &std::path::Path, line: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let over = std::fs::metadata(path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false);
    if over {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let start = bytes.len().saturating_sub(KEEP_BYTES);
        // Start at a whole line.
        let cut = bytes[start..]
            .iter()
            .position(|&b| b == b'\n')
            .map(|i| start + i + 1)
            .unwrap_or(bytes.len());
        let mut kept = format!("{}\t{}\t\n", now_iso(), "Older lines were trimmed").into_bytes();
        kept.extend_from_slice(&bytes[cut..]);
        std::fs::write(path, kept).map_err(|e| e.to_string())?;
    }
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

/// Record one event for the server `key` and show it in the window's log.
pub fn record(app: &AppHandle, key: &str, message: &str, detail: String) {
    let utc = now_iso();
    if let Ok(path) = path(app, key) {
        let _ = append(&path, &format_line(&utc, message, &detail));
    }
    let _ = app.emit(
        "session-output",
        &OutputLine::Launcher {
            time: clock_of(&utc),
            message: clean(message),
            detail: clean(&detail),
        },
    );
}

/// The log of `key`, newest last; empty when there is none.
pub fn read(app: &AppHandle, key: &str) -> Result<String, String> {
    let path = path(app, key)?;
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(e) => return Err(e.to_string()),
    };
    let start = bytes.len().saturating_sub(MAX_READ as usize);
    Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

/// Remove a forgotten server's log.
pub fn forget(app: &AppHandle, key: &str) {
    if let Ok(path) = path(app, key) {
        let _ = std::fs::remove_file(path);
    }
}

/// Nanoseconds since the epoch, for tests that need a unique folder.
#[cfg(test)]
fn unique() -> u128 {
    SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_is_an_iso_stamp_with_a_clock() {
        let now = now_iso();
        assert_eq!(now.len(), 20, "{now}");
        assert_eq!(&now[4..5], "-");
        assert_eq!(&now[10..11], "T");
        assert_eq!(&now[13..14], ":");
        assert!(now.ends_with('Z'));
        assert_eq!(clock_of(&now).len(), 8);
    }

    #[test]
    fn keys_are_entry_ids_or_this_pc() {
        assert!(is_key("this-pc"));
        assert!(is_key("0123456789abcdef"));
        assert!(!is_key("0123456789ABCDEF"));
        assert!(!is_key("../settings"));
        assert!(!is_key(""));
    }

    #[test]
    fn lines_are_tab_separated_and_cleaned() {
        let line = format_line("2026-10-22T20:00:00Z", "Picked Garage\tPC\n", "6 ms");
        assert_eq!(line, "2026-10-22T20:00:00Z\tPicked GaragePC\t6 ms\n");
        assert_eq!(clock_of("2026-10-22T20:01:02Z"), "20:01:02");
        assert_eq!(clock_of("bad"), "");
        assert_eq!(clean(&"x".repeat(1000)).len(), MAX_TEXT);
    }

    #[test]
    fn the_log_appends_and_keeps_its_newest_lines_when_full() {
        let dir = std::env::temp_dir().join(format!("afterhours-gui-connlog-{}", unique()));
        let path = dir.join("servers").join("this-pc.log");
        append(&path, &format_line("2026-10-22T20:00:00Z", "first", "")).unwrap();
        append(&path, &format_line("2026-10-22T20:00:01Z", "second", "x")).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            text,
            "2026-10-22T20:00:00Z\tfirst\t\n2026-10-22T20:00:01Z\tsecond\tx\n"
        );
        // Fill it past the bound, then one more line trims it.
        let line = format_line("2026-10-22T20:00:02Z", &"m".repeat(200), "");
        let mut big = String::new();
        while (big.len() as u64) <= MAX_BYTES {
            big.push_str(&line);
        }
        std::fs::write(&path, &big).unwrap();
        append(&path, &format_line("2026-10-22T20:00:03Z", "newest", "")).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.len() <= KEEP_BYTES + 2 * line.len());
        assert!(text.contains("Older lines were trimmed"));
        assert!(text.ends_with("2026-10-22T20:00:03Z\tnewest\t\n"));
        // Every kept line is whole.
        assert!(text.lines().all(|l| l.matches('\t').count() == 2));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
