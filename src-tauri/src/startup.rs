// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Failures before the webview exists still need a visible error and a local
//! report. Never collect settings, command arguments, tokens or save contents.

use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_ERROR_CHARS: usize = 4096;

#[derive(Clone, Serialize)]
pub(crate) struct Report {
    version: u8,
    launcher_version: &'static str,
    identifier: String,
    stage: &'static str,
    local_data: Option<PathBuf>,
    config: Option<PathBuf>,
    path_errors: Vec<String>,
    window_data: Vec<PathBuf>,
    error: String,
    unix_seconds: u64,
}

#[derive(Clone)]
pub(crate) struct Startup {
    report: Arc<Mutex<Report>>,
    ready: Arc<AtomicBool>,
    reported: Arc<AtomicBool>,
    fallback: PathBuf,
}

impl Startup {
    pub(crate) fn new(identifier: &str, window_data: Vec<PathBuf>) -> Self {
        let safe_id: String = identifier
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
            .collect();
        Self {
            report: Arc::new(Mutex::new(Report {
                version: 1,
                launcher_version: env!("CARGO_PKG_VERSION"),
                identifier: identifier.to_owned(),
                stage: "building application",
                local_data: None,
                config: None,
                path_errors: Vec::new(),
                window_data,
                error: String::new(),
                unix_seconds: 0,
            })),
            ready: Arc::new(AtomicBool::new(false)),
            reported: Arc::new(AtomicBool::new(false)),
            fallback: std::env::temp_dir().join(format!("afterhours-{safe_id}-startup-error.json")),
        }
    }

    pub(crate) fn paths(&self, local: Result<PathBuf, String>, config: Result<PathBuf, String>) {
        let mut report = self.report.lock().unwrap_or_else(|e| e.into_inner());
        report.local_data = local
            .map_err(|e| report.path_errors.push(format!("local data: {e}")))
            .ok();
        report.config = config
            .map_err(|e| report.path_errors.push(format!("config: {e}")))
            .ok();
    }

    pub(crate) fn stage(&self, stage: &'static str) {
        self.report.lock().unwrap_or_else(|e| e.into_inner()).stage = stage;
    }

    pub(crate) fn ready(&self) {
        self.ready.store(true, Ordering::Release);
    }

    pub(crate) fn install_hook(&self) {
        let startup = self.clone();
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            if !startup.ready.load(Ordering::Acquire)
                && !startup.reported.swap(true, Ordering::AcqRel)
            {
                let mut report = startup
                    .report
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                report.error = info.to_string().chars().take(MAX_ERROR_CHARS).collect();
                report.unix_seconds = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let saved = save_report(&report, &startup.fallback);
                let description = failure_description(&report, &saved);
                eprintln!("{description}");
                // Native dialog: no webview, server, network or settings access.
                #[cfg(windows)]
                rfd::MessageDialog::new()
                    .set_title("Afterhours could not start")
                    .set_level(rfd::MessageLevel::Error)
                    .set_description(&description)
                    .show();
            }
            previous(info);
        }));
    }
}

fn save_report(report: &Report, fallback: &Path) -> Result<PathBuf, String> {
    let bytes = serde_json::to_vec_pretty(report).map_err(|e| e.to_string())?;
    let primary = report
        .local_data
        .as_ref()
        .map(|dir| dir.join("startup-error.json"));
    let mut errors = Vec::new();
    for path in primary
        .iter()
        .map(PathBuf::as_path)
        .chain(std::iter::once(fallback))
    {
        let result = (|| {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(path, &bytes)
        })();
        match result {
            Ok(()) => return Ok(path.to_path_buf()),
            Err(error) => errors.push(format!("{}: {error}", path.display())),
        }
    }
    Err(errors.join("\n"))
}

fn failure_description(report: &Report, saved: &Result<PathBuf, String>) -> String {
    let location = match saved {
        Ok(path) => format!("Details saved to:\n{}", path.display()),
        Err(error) => format!("The error report could not be saved:\n{error}"),
    };
    format!(
        "Startup failed while {}.\n\n{}\n\n{location}",
        report.stage, report.error
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unwritable_report_location_falls_back_without_replacing_the_blocking_file() {
        let root = std::env::temp_dir().join(format!(
            "afterhours-startup-fallback-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let blocked = root.join("a-file-not-a-directory");
        std::fs::write(&blocked, b"preserve").unwrap();
        let startup = Startup::new("crew.afterhours.launcher.prologue-preview", vec![]);
        startup.paths(Ok(blocked.clone()), Ok(root.join("config")));
        startup.stage("creating application window");
        let mut report = startup.report.lock().unwrap().clone();
        report.error = "Access is denied. (os error 5)".to_owned();
        let fallback = root.join("fallback.json");
        let saved = save_report(&report, &fallback).unwrap();
        assert_eq!(saved, fallback);
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(saved).unwrap()).unwrap();
        assert_eq!(value["stage"], "creating application window");
        assert_eq!(value["error"], report.error);
        assert_eq!(value["local_data"], blocked.to_string_lossy().as_ref());
        assert_eq!(std::fs::read(blocked).unwrap(), b"preserve");
        assert!(value.get("settings").is_none());
        assert!(value.get("arguments").is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_both_failed_destinations_instead_of_claiming_a_log_was_saved() {
        let root =
            std::env::temp_dir().join(format!("afterhours-startup-both-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let blocked = root.join("file");
        std::fs::write(&blocked, b"preserve").unwrap();
        let startup = Startup::new("test", vec![]);
        startup.paths(Ok(blocked.clone()), Err("known folder unavailable".into()));
        let report = startup.report.lock().unwrap().clone();
        assert_eq!(report.path_errors, ["config: known folder unavailable"]);
        let saved = save_report(&report, &blocked.join("fallback.json"));
        let error = saved.as_ref().unwrap_err();
        assert!(error.contains("startup-error.json"));
        assert!(error.contains("fallback.json"));
        assert!(failure_description(&report, &saved).contains("could not be saved"));
        assert_eq!(std::fs::read(blocked).unwrap(), b"preserve");
        std::fs::remove_dir_all(root).unwrap();
    }
}
