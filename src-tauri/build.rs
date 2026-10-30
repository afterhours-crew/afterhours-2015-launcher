// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Reads `server-pin.json`, hands the pinned server tag and hash to the app,
//! and refuses to build a Windows app whose bundled `Afterhours2015Server.exe` is not
//! the pinned one. `pnpm sidecar` puts the verified executable in place.

#[allow(dead_code)]
#[path = "src/pin.rs"]
mod pin;

use std::path::PathBuf;

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let pin_path = manifest.join("..").join(pin::FILE_NAME);
    println!("cargo:rerun-if-changed={}", pin_path.display());
    let text = std::fs::read_to_string(&pin_path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", pin_path.display()));
    let pin = pin::Pin::parse(&text).unwrap_or_else(|e| panic!("{e}"));
    println!(
        "cargo:rustc-env=AFTERHOURS_SERVER_REPOSITORY={}",
        pin.repository
    );
    println!("cargo:rustc-env=AFTERHOURS_SERVER_TAG={}", pin.tag);
    println!(
        "cargo:rustc-env=AFTERHOURS_SERVER_SHA256={}",
        pin.executable_sha256
    );

    // Only Windows bundles the server (tauri.windows.conf.json). Elsewhere
    // the app runs whatever AFTERHOURS_EXE names, in development builds.
    let target = std::env::var("TARGET").expect("TARGET");
    if target.contains("windows") {
        if target != pin::BUNDLED_TARGET {
            panic!(
                "{} {} is published for {} only, not {target}.",
                pin.repository,
                pin.tag,
                pin::BUNDLED_TARGET
            );
        }
        let sidecar = manifest
            .join("binaries")
            .join(pin::sidecar_file_name(pin::BUNDLED_SERVER_STEM, &target));
        println!("cargo:rerun-if-changed={}", sidecar.display());
        let check = pin::check_file(&sidecar, &pin.executable_sha256)
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", sidecar.display()));
        match check {
            pin::Check::Matches => {}
            pin::Check::Missing => panic!(
                "{} is missing. Run `pnpm sidecar` to download and verify {} {}.",
                sidecar.display(),
                pin.executable,
                pin.tag
            ),
            pin::Check::Mismatch { actual } => panic!(
                "{} has SHA-256 {actual}, but {} pins {} {} at {}. Run `pnpm sidecar` again; \
                 never edit the pin to match a file.",
                sidecar.display(),
                pin::FILE_NAME,
                pin.executable,
                pin.tag,
                pin.executable_sha256
            ),
        }
    }

    tauri_build::build()
}
