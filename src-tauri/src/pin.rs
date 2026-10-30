// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Afterhours server release this launcher bundles.
//!
//! `server-pin.json` at the repository root names exactly one
//! afterhours-crew/afterhours-2015 release: its tag, the ZIP asset with the
//! SHA-256 that release lists in `SHA256SUMS.txt`, and the SHA-256 of the
//! `Afterhours.exe` inside that ZIP (from the ZIP's own `build-info.json`).
//! `pnpm sidecar` downloads the ZIP, checks both hashes and extracts the
//! executable to `src-tauri/binaries/`, where Tauri's `externalBin` picks it
//! up. `build.rs` refuses to build with a sidecar that does not match the
//! pin, and the app uses the same functions to re-check the installed copy.
//!
//! build.rs compiles this file too (`#[path]`), so it uses nothing but std,
//! serde and sha2.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::{self, Read},
    path::Path,
};

/// The pin file, relative to the repository root.
pub const FILE_NAME: &str = "server-pin.json";

/// Largest pin file accepted; the real one is a few hundred bytes.
pub const MAX_PIN_BYTES: usize = 4096;

/// The only target the server repository publishes a bundle for.
pub const BUNDLED_TARGET: &str = "x86_64-pc-windows-msvc";

/// Distribution name, independent of the upstream archive's executable name.
pub const BUNDLED_SERVER_STEM: &str = "Afterhours2015Server";

/// One pinned server release.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pin {
    /// `owner/name` of the server repository.
    pub repository: String,
    /// Release tag, for example `v0.3.0`.
    pub tag: String,
    /// Release asset holding the executable.
    pub asset: String,
    /// SHA-256 of `asset`, as listed in the release's `SHA256SUMS.txt`.
    pub asset_sha256: String,
    /// Executable inside `asset`.
    pub executable: String,
    /// SHA-256 of `executable`, as recorded in the ZIP's `build-info.json`.
    pub executable_sha256: String,
    /// Where `schemas/` came from: the release's assets, or the minimal
    /// copies vendored here until the server publishes its own.
    pub schemas: SchemaSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SchemaSource {
    Vendored,
    Release,
}

impl Pin {
    /// Parse and validate a pin file's text.
    pub fn parse(text: &str) -> Result<Pin, String> {
        if text.len() > MAX_PIN_BYTES {
            return Err(format!("{FILE_NAME} is larger than {MAX_PIN_BYTES} bytes."));
        }
        let pin: Pin = serde_json::from_str(text)
            .map_err(|e| format!("{FILE_NAME} is not a valid pin: {e}"))?;
        pin.validate()?;
        Ok(pin)
    }

    fn validate(&self) -> Result<(), String> {
        let repository_ok = self
            .repository
            .split_once('/')
            .is_some_and(|(owner, name)| {
                [owner, name].iter().all(|part| {
                    !part.is_empty()
                        && part
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                })
            });
        if !repository_ok {
            return Err(format!("{FILE_NAME}: repository must be owner/name."));
        }
        if !is_release_tag(&self.tag) {
            return Err(format!("{FILE_NAME}: tag must look like v1.2.3."));
        }
        if !is_plain_file_name(&self.asset) || !is_plain_file_name(&self.executable) {
            return Err(format!(
                "{FILE_NAME}: asset and executable must be plain file names."
            ));
        }
        if !self.executable.ends_with(".exe") {
            return Err(format!("{FILE_NAME}: the executable must be a .exe."));
        }
        if !is_sha256_hex(&self.asset_sha256) || !is_sha256_hex(&self.executable_sha256) {
            return Err(format!(
                "{FILE_NAME}: hashes must be 64 lowercase hexadecimal digits."
            ));
        }
        Ok(())
    }
}

/// 64 lowercase hexadecimal digits.
pub fn is_sha256_hex(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `v` followed by three dot-separated numbers without leading zeros and an optional
/// `-prerelease` of letters, digits, dots and hyphens.
pub fn is_release_tag(text: &str) -> bool {
    let Some(rest) = text.strip_prefix('v') else {
        return false;
    };
    let (core, pre) = match rest.split_once('-') {
        Some((core, pre)) => (core, Some(pre)),
        None => (rest, None),
    };
    let parts: Vec<&str> = core.split('.').collect();
    let core_ok = parts.len() == 3
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.len() <= 9
                && p.bytes().all(|b| b.is_ascii_digit())
                && (p == &"0" || !p.starts_with('0'))
        });
    let pre_ok = pre.is_none_or(|pre| {
        !pre.is_empty()
            && pre.len() <= 64
            && pre
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    });
    text.len() <= 80 && core_ok && pre_ok
}

fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name != "."
        && name != ".."
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
}

/// SHA-256 of everything `reader` yields, as lowercase hex.
pub fn sha256_reader(mut reader: impl Read) -> io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// SHA-256 of a file, as lowercase hex.
pub fn sha256_file(path: &Path) -> io::Result<String> {
    sha256_reader(std::fs::File::open(path)?)
}

/// Result of comparing a file with its pinned hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Check {
    Matches,
    Missing,
    Mismatch { actual: String },
}

/// Compare a file's SHA-256 with `expected`. A missing file is a result,
/// not an error; any other I/O failure is an error.
pub fn check_file(path: &Path, expected: &str) -> io::Result<Check> {
    match sha256_file(path) {
        Ok(actual) if actual == expected => Ok(Check::Matches),
        Ok(actual) => Ok(Check::Mismatch { actual }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Check::Missing),
        Err(e) => Err(e),
    }
}

/// Tauri's `externalBin` file name: `<stem>-<target triple><exe suffix>`.
pub fn sidecar_file_name(stem: &str, target: &str) -> String {
    let suffix = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    format!("{stem}-{target}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PIN: &str = r#"{
        "repository": "afterhours-crew/afterhours-2015",
        "tag": "v0.3.0",
        "asset": "Afterhours-windows-x64.zip",
        "asset_sha256": "714d8a8ce85189d121ade4ade35f9d6cdc4a8f35cdd8d19e2484332e5322572e",
        "executable": "Afterhours.exe",
        "executable_sha256": "e5ac1e6f28619595b657573a02ac92b04e77279e817bdfc1fc3432f894811efe",
        "schemas": "vendored"
    }"#;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("afterhours-gui-pin-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_committed_pin_parses() {
        let text = include_str!("../../server-pin.json");
        let pin = Pin::parse(text).unwrap();
        assert_eq!(pin.repository, "afterhours-crew/afterhours-2015");
        assert!(is_release_tag(&pin.tag));
        assert_eq!(pin.executable, "Afterhours.exe");
    }

    #[test]
    fn a_valid_pin_parses_and_names_its_sidecar() {
        let pin = Pin::parse(PIN).unwrap();
        assert_eq!(pin.tag, "v0.3.0");
        assert_eq!(pin.schemas, SchemaSource::Vendored);
        assert_eq!(
            sidecar_file_name(BUNDLED_SERVER_STEM, BUNDLED_TARGET),
            "Afterhours2015Server-x86_64-pc-windows-msvc.exe"
        );
        assert_eq!(
            sidecar_file_name("Afterhours", "x86_64-unknown-linux-gnu"),
            "Afterhours-x86_64-unknown-linux-gnu"
        );
    }

    #[test]
    fn invalid_pins_are_refused_with_a_reason() {
        let cases = [
            ("\"tag\": \"v0.3.0\"", "\"tag\": \"0.3.0\"", "tag"),
            ("\"tag\": \"v0.3.0\"", "\"tag\": \"v0.3\"", "tag"),
            ("\"tag\": \"v0.3.0\"", "\"tag\": \"v0.3.0-rc 1\"", "tag"),
            (
                "\"asset_sha256\": \"714d",
                "\"asset_sha256\": \"714D",
                "hashes",
            ),
            (
                "\"executable\": \"Afterhours.exe\"",
                "\"executable\": \"../Afterhours.exe\"",
                "file names",
            ),
            (
                "\"executable\": \"Afterhours.exe\"",
                "\"executable\": \"Afterhours\"",
                ".exe",
            ),
            (
                "\"repository\": \"afterhours-crew/afterhours-2015\"",
                "\"repository\": \"afterhours-2015\"",
                "owner/name",
            ),
            (
                "\"schemas\": \"vendored\"",
                "\"schemas\": \"guessed\"",
                "pin",
            ),
            (
                "\"schemas\": \"vendored\"",
                "\"schemas\": \"vendored\", \"extra\": 1",
                "pin",
            ),
        ];
        for (from, to, reason) in cases {
            let text = PIN.replace(from, to);
            assert_ne!(text, PIN, "case {to} did not change the pin");
            let error = Pin::parse(&text).unwrap_err();
            assert!(error.contains(reason), "{to}: {error}");
        }
        assert!(Pin::parse(&" ".repeat(MAX_PIN_BYTES + 1)).is_err());
        assert!(Pin::parse("{").is_err());
    }

    #[test]
    fn release_tags_follow_semver_with_a_v() {
        for good in ["v0.3.0", "v10.20.30", "v1.0.0-rc.1", "v1.0.0-beta-2"] {
            assert!(is_release_tag(good), "{good}");
        }
        for bad in [
            "",
            "v",
            "v1",
            "v1.2",
            "v1.2.3.4",
            "1.2.3",
            "v1.2.x",
            "v1.2.3-",
            "v1.2.3-a/b",
            "v01.2.3",
        ] {
            assert!(!is_release_tag(bad), "{bad}");
        }
    }

    #[test]
    fn hashing_matches_known_vectors() {
        assert_eq!(
            sha256_reader(&b""[..]).unwrap(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_reader(&b"abc"[..]).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        // Longer than one read buffer.
        let long = vec![b'a'; 1_000_000];
        assert_eq!(
            sha256_reader(&long[..]).unwrap(),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn file_checks_report_match_mismatch_and_missing() {
        let dir = temp("check");
        let path = dir.join("Afterhours-x86_64-pc-windows-msvc.exe");
        let abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(check_file(&path, abc).unwrap(), Check::Missing);
        std::fs::write(&path, b"abc").unwrap();
        assert_eq!(check_file(&path, abc).unwrap(), Check::Matches);
        std::fs::write(&path, b"abd").unwrap();
        assert!(matches!(
            check_file(&path, abc).unwrap(),
            Check::Mismatch { actual } if is_sha256_hex(&actual) && actual != abc
        ));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
