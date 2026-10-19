// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which `Afterhours.exe` the launcher runs.
//!
//! Release builds always run the copy bundled next to the launcher, which
//! `build.rs` checked against `server-pin.json`. Development builds may run
//! another build named by `AFTERHOURS_EXE` instead: an `Afterhours.exe` or an
//! `nfs-afterhours` from an afterhours-2015 checkout, which takes the same
//! commands. Release builds ignore the variable, so a leftover development
//! setting can never make an installed launcher run a different server
//! against a tester's saves.

use crate::pin;
use serde::Serialize;
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

/// Development override for the server executable.
pub const OVERRIDE_ENV: &str = "AFTERHOURS_EXE";

/// The pinned release, from `server-pin.json` via build.rs.
pub const PINNED_REPOSITORY: &str = env!("AFTERHOURS_SERVER_REPOSITORY");
pub const PINNED_TAG: &str = env!("AFTERHOURS_SERVER_TAG");
pub const PINNED_SHA256: &str = env!("AFTERHOURS_SERVER_SHA256");

/// Whether this build honours `AFTERHOURS_EXE`.
pub const OVERRIDE_ALLOWED: bool = cfg!(debug_assertions);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// The pinned copy installed next to the launcher.
    Bundled,
    /// `AFTERHOURS_EXE` in a development build.
    Override,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Server {
    pub path: PathBuf,
    pub source: Source,
}

/// The bundled executable's file name next to the launcher. Tauri strips
/// the target triple from `externalBin` names when it installs them.
pub fn bundled_file_name() -> String {
    format!("Afterhours{}", std::env::consts::EXE_SUFFIX)
}

/// Decide which executable to run. Pure apart from checking that the
/// chosen file exists, so the rules are tested without a real install.
pub fn resolve(
    override_value: Option<OsString>,
    override_allowed: bool,
    launcher_dir: Option<&Path>,
) -> Result<Server, String> {
    if override_allowed && let Some(value) = override_value.filter(|v| !v.is_empty()) {
        let path = PathBuf::from(value);
        return if path.is_file() {
            Ok(Server {
                path,
                source: Source::Override,
            })
        } else {
            Err(format!(
                "{OVERRIDE_ENV} names {}, which is not a file.",
                path.display()
            ))
        };
    }
    let bundled = launcher_dir.map(|dir| dir.join(bundled_file_name()));
    match bundled {
        Some(path) if path.is_file() => Ok(Server {
            path,
            source: Source::Bundled,
        }),
        _ if cfg!(windows) => {
            Err("The bundled Afterhours server is missing. Reinstall the launcher.".to_owned())
        }
        _ => Err(format!(
            "This platform has no bundled server. In a development build, set {OVERRIDE_ENV} \
             to an nfs-afterhours build from afterhours-2015."
        )),
    }
}

/// Resolve for this process: its environment and its own directory.
pub fn current() -> Result<Server, String> {
    let launcher_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    resolve(
        std::env::var_os(OVERRIDE_ENV),
        OVERRIDE_ALLOWED,
        launcher_dir.as_deref(),
    )
}

/// What Settings → About shows about the server.
#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub repository: &'static str,
    pub pinned_tag: &'static str,
    pub pinned_sha256: &'static str,
    pub override_allowed: bool,
    pub path: Option<PathBuf>,
    pub source: Option<Source>,
    /// The first line `--version` printed, when it ran.
    pub version_line: Option<String>,
    /// Whether the bundled file still has the pinned hash. `None` for an
    /// override or when no file was found.
    pub matches_pin: Option<bool>,
    /// Features the server reports in `version --json` (contract v1), such
    /// as `profile` or `map`. `None` for servers without that command,
    /// which report none: screens that need one say "Coming later".
    pub capabilities: Option<Vec<String>>,
    pub error: Option<String>,
}

/// Most capabilities read from one server, and the longest name.
const MAX_CAPABILITIES: usize = 64;
const MAX_CAPABILITY_LEN: usize = 64;

/// The `capabilities` array of `version --json`, bounded; anything
/// malformed is no capabilities at all rather than a guess.
pub fn parse_capabilities(stdout: &str) -> Option<Vec<String>> {
    let value: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
    let list = value.get("capabilities")?.as_array()?;
    if list.len() > MAX_CAPABILITIES {
        return None;
    }
    list.iter()
        .map(|item| {
            item.as_str()
                .filter(|name| {
                    !name.is_empty()
                        && name.len() <= MAX_CAPABILITY_LEN
                        && name.bytes().all(|b| {
                            b.is_ascii_lowercase() || b.is_ascii_digit() || b"-_".contains(&b)
                        })
                })
                .map(str::to_owned)
        })
        .collect()
}

/// Locate the server, ask it for its version and re-check its hash.
pub fn info() -> ServerInfo {
    let mut info = ServerInfo {
        repository: PINNED_REPOSITORY,
        pinned_tag: PINNED_TAG,
        pinned_sha256: PINNED_SHA256,
        override_allowed: OVERRIDE_ALLOWED,
        path: None,
        source: None,
        version_line: None,
        matches_pin: None,
        capabilities: None,
        error: None,
    };
    let server = match current() {
        Ok(server) => server,
        Err(e) => {
            info.error = Some(e);
            return info;
        }
    };
    if server.source == Source::Bundled {
        info.matches_pin = pin::sha256_file(&server.path)
            .ok()
            .map(|actual| actual == PINNED_SHA256);
    }
    match crate::cli::run_raw(
        &server.path,
        &["--version".to_owned()],
        std::time::Duration::from_secs(10),
    ) {
        Ok(output) if output.code == Some(0) => {
            info.version_line = output
                .stdout
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
                .map(str::to_owned);
        }
        Ok(output) => info.error = Some(output.last_stderr_line()),
        Err(e) => info.error = Some(e),
    }
    // v0.3.0 has no `version` command and refuses it; that is no capabilities.
    let args = ["version".to_owned(), "--json".to_owned()];
    if let Ok(output) = crate::cli::run_raw(&server.path, &args, std::time::Duration::from_secs(10))
        && output.code == Some(0)
    {
        info.capabilities = parse_capabilities(&output.stdout);
    }
    info.path = Some(server.path);
    info.source = Some(server.source);
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "afterhours-gui-server-{name}-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_pin_reaches_the_app() {
        assert!(pin::is_release_tag(PINNED_TAG));
        assert!(pin::is_sha256_hex(PINNED_SHA256));
        assert!(PINNED_REPOSITORY.contains('/'));
        let text = include_str!("../../server-pin.json");
        let pinned = pin::Pin::parse(text).unwrap();
        assert_eq!(pinned.tag, PINNED_TAG);
        assert_eq!(pinned.executable_sha256, PINNED_SHA256);
    }

    #[test]
    fn capabilities_come_only_from_a_well_formed_version_report() {
        let report = r#"{"version":1,"program":"Afterhours","capabilities":["profile","sessions","events"]}"#;
        assert_eq!(
            parse_capabilities(report),
            Some(vec!["profile".into(), "sessions".into(), "events".into()])
        );
        assert_eq!(parse_capabilities(r#"{"capabilities":[]}"#), Some(vec![]));
        for bad in [
            "",
            "Afterhours 0.3.0 (v0.3.0 / 68aaaac)",
            r#"{"version":1}"#,
            r#"{"capabilities":"map"}"#,
            r#"{"capabilities":["map",3]}"#,
            r#"{"capabilities":["Map"]}"#,
            r#"{"capabilities":["../x"]}"#,
        ] {
            assert_eq!(parse_capabilities(bad), None, "{bad}");
        }
        let many: Vec<String> = (0..=MAX_CAPABILITIES)
            .map(|i| format!("\"c{i}\""))
            .collect();
        assert_eq!(
            parse_capabilities(&format!(r#"{{"capabilities":[{}]}}"#, many.join(","))),
            None
        );
    }

    #[test]
    fn the_bundled_copy_is_used_unless_a_development_override_names_a_file() {
        let dir = temp("resolve");
        let bundled = dir.join(bundled_file_name());
        let other = dir.join("nfs-afterhours-dev");
        std::fs::write(&bundled, b"x").unwrap();
        std::fs::write(&other, b"x").unwrap();

        let plain = resolve(None, true, Some(&dir)).unwrap();
        assert_eq!(plain.source, Source::Bundled);
        assert_eq!(plain.path, bundled);

        let dev = resolve(Some(other.clone().into()), true, Some(&dir)).unwrap();
        assert_eq!((dev.source, dev.path), (Source::Override, other.clone()));

        // Release builds ignore the variable entirely.
        let release = resolve(Some(other.into()), false, Some(&dir)).unwrap();
        assert_eq!(release.source, Source::Bundled);

        // An empty variable is unset; a wrong one is an error, not a fallback.
        assert_eq!(
            resolve(Some(OsString::new()), true, Some(&dir))
                .unwrap()
                .source,
            Source::Bundled
        );
        let wrong = resolve(Some(dir.join("missing").into()), true, Some(&dir)).unwrap_err();
        assert!(wrong.contains(OVERRIDE_ENV));

        std::fs::remove_file(&bundled).unwrap();
        let missing = resolve(None, true, Some(&dir)).unwrap_err();
        assert!(missing.contains("bundled") || missing.contains(OVERRIDE_ENV));
        assert!(resolve(None, true, None).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
