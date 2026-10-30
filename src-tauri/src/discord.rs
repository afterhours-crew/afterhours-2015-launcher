// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Presence only: no authentication, subscriptions, remote HTTP or game control.
//! https://docs.discord.com/developers/topics/rpc (accessed 2026-10-30).
//! Only constant text leaves this module. Never log incoming Discord frames.

mod helper;
mod worker;
pub(crate) use helper::entry;

use crate::{cli, settings::Settings};
use discord_presence::models::ActivityType;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};
use tokio::sync::watch;

const APPLICATION_ID: u64 = 1565749588378259597;
const IMAGE_KEY: &str = "afterhours";
const POLL: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Activity {
    Launcher,
    Preparing,
    Starting,
    Playing,
    Hosting,
    Stopping,
}

impl Activity {
    fn payload(self) -> discord_presence::models::Activity {
        let details = match self {
            Self::Launcher => "In the launcher",
            Self::Preparing => "Preparing the game",
            Self::Starting => "Starting the game",
            Self::Playing => "Playing Afterhours 2015",
            Self::Hosting => "Hosting a local server",
            Self::Stopping => "Stopping the session",
        };
        discord_presence::models::Activity::new()
            .activity_type(ActivityType::Playing)
            .details(details)
            .assets(|assets| assets.large_image(IMAGE_KEY).large_text("Afterhours 2015"))
    }

    /// Input is exclusively the canonical LOCAL `status --json` command.
    /// It checks process receipts itself, including a locally running relay.
    /// An action of `start` alone is not proof that a game is still running.
    fn local(result: &Result<cli::CliResult, String>) -> Self {
        let Ok(cli::CliResult::Ok { value }) = result else {
            return Self::Launcher;
        };
        let status = if value.get("session").is_some() {
            if value["version"] != 1 {
                return Self::Launcher;
            }
            &value["session"]
        } else {
            value
        };
        if !status["id"].is_string() {
            return Self::Launcher;
        }
        match status["state"].as_str() {
            Some("preparing") => Self::Preparing,
            Some("starting" | "activation") => Self::Starting,
            Some("stopping") => Self::Stopping,
            Some("ready") => {
                let playing = match status.get("game_running") {
                    Some(value) => value.as_bool() == Some(true),
                    None => status["game_pid"].as_u64().is_some_and(|pid| pid > 0),
                };
                if playing {
                    Self::Playing
                } else if status["action"] == "serve" {
                    Self::Hosting
                } else {
                    Self::Launcher
                }
            }
            _ => Self::Launcher,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Desired {
    Off,
    Show(Activity),
    Shutdown,
}

struct Model {
    enabled: bool,
    data_dir: Option<PathBuf>,
    epoch: u64,
    shutdown: bool,
    desired: watch::Sender<Desired>,
}

impl Model {
    fn configure(&mut self, settings: &Settings) {
        if self.shutdown
            || (self.enabled == settings.discord_presence && self.data_dir == settings.data_dir)
        {
            return;
        }
        self.enabled = settings.discord_presence;
        self.data_dir = settings.data_dir.clone();
        self.epoch = self.epoch.wrapping_add(1);
        self.desired.send_replace(if self.enabled {
            Desired::Show(Activity::Launcher)
        } else {
            Desired::Off
        });
    }

    fn accept(&self, epoch: u64, activity: Activity) {
        if self.enabled && !self.shutdown && epoch == self.epoch {
            self.desired.send_if_modified(|current| {
                let next = Desired::Show(activity);
                if *current == next {
                    false
                } else {
                    *current = next;
                    true
                }
            });
        }
    }
}

/// One sampler and one IPC worker per window, with a single latest-value slot.
/// Settings changes invalidate pending reads. Off never discovers Discord.
pub struct Presence {
    model: Arc<Mutex<Model>>,
    stopped: Mutex<mpsc::Receiver<()>>,
}

impl Presence {
    pub fn start(settings: &Settings) -> Self {
        let (desired, receiver) = watch::channel(Desired::Off);
        let model = Arc::new(Mutex::new(Model {
            enabled: false,
            data_dir: None,
            epoch: 0,
            shutdown: false,
            desired,
        }));
        let (done, stopped) = mpsc::channel();
        let worker = receiver.clone();
        tauri::async_runtime::spawn(async move {
            worker::run(worker).await;
            let _ = done.send(());
        });
        let sampler = Arc::clone(&model);
        tauri::async_runtime::spawn(async move {
            sample(sampler, receiver).await;
        });
        let presence = Self {
            model,
            stopped: Mutex::new(stopped),
        };
        presence.configure(settings);
        presence
    }

    pub fn configure(&self, settings: &Settings) {
        if let Ok(mut model) = self.model.lock() {
            model.configure(settings);
        }
    }

    /// Called only when the application actually exits, not when close is refused.
    /// Clear is best effort and bounded; never wait for a local status command.
    pub fn shutdown(&self) {
        if let Ok(mut model) = self.model.lock() {
            model.shutdown = true;
            model.desired.send_replace(Desired::Shutdown);
        }
        if let Ok(stopped) = self.stopped.lock() {
            let _ = stopped.recv_timeout(Duration::from_secs(1));
        }
    }
}

async fn sample(model: Arc<Mutex<Model>>, mut changes: watch::Receiver<Desired>) {
    loop {
        let request = match model.lock() {
            Ok(model) if model.shutdown => return,
            Ok(model) if model.enabled => Some((
                model.epoch,
                Settings {
                    data_dir: model.data_dir.clone(),
                    ..Settings::default()
                },
            )),
            Ok(_) => None,
            Err(_) => return,
        };
        if let Some((epoch, settings)) = request {
            // Never `session_status`: that command can read the selected REMOTE
            // server. This local read has a 10 s deadline and 1 MiB output bound.
            // Await it even after opt-out so rapid toggles cannot pile up children.
            let result = tauri::async_runtime::spawn_blocking(move || cli::status(&settings)).await;
            let activity = result.map_or(Activity::Launcher, |result| Activity::local(&result));
            if let Ok(model) = model.lock() {
                model.accept(epoch, activity);
            }
        }
        // Activity updates also wake this channel: consume them before sleeping.
        changes.borrow_and_update();
        tokio::select! {
            _ = tokio::time::sleep(POLL) => {},
            result = changes.changed() => if result.is_err() { return; },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn status(state: &str, game: bool, action: &str) -> Result<cli::CliResult, String> {
        Ok(cli::CliResult::Ok {
            value: json!({"version":1,"session":{
            "id":"private-session", "state":state, "game_running":game, "action":action,
            "message":"private user path and address", "utc":"not a start time"}}),
        })
    }
    #[test]
    fn local_transitions_never_publish_report_fields_or_guess_gameplay() {
        for action in ["serve", "start"] {
            assert_eq!(
                Activity::local(&status("ready", true, action)),
                Activity::Playing
            );
            for state in ["finished", "failed", "interrupted", "future"] {
                assert_eq!(
                    Activity::local(&status(state, true, action)),
                    Activity::Launcher
                );
            }
        }
        assert_eq!(
            Activity::local(&status("ready", false, "serve")),
            Activity::Hosting
        );
        assert_eq!(
            Activity::local(&status("ready", false, "start")),
            Activity::Launcher
        );
        assert_eq!(
            Activity::local(&Err("private error".into())),
            Activity::Launcher
        );
        for (state, expected) in [
            ("preparing", Activity::Preparing),
            ("starting", Activity::Starting),
            ("activation", Activity::Starting),
            ("stopping", Activity::Stopping),
        ] {
            assert_eq!(Activity::local(&status(state, false, "start")), expected);
        }
        let payload =
            serde_json::to_value(Activity::local(&status("ready", true, "start")).payload())
                .unwrap();
        assert_eq!(
            payload,
            json!({"type":0,"details":"Playing Afterhours 2015","assets":{"large_image":"afterhours","large_text":"Afterhours 2015"}})
        );
    }
    #[test]
    fn legacy_pid_is_only_used_when_the_explicit_flag_is_absent() {
        let mut value = json!({"id":"legacy","state":"ready","game_pid":123});
        assert_eq!(
            Activity::local(&Ok(cli::CliResult::Ok {
                value: value.clone()
            })),
            Activity::Playing
        );
        value["game_running"] = json!(false);
        assert_eq!(
            Activity::local(&Ok(cli::CliResult::Ok { value })),
            Activity::Launcher
        );
    }
    #[test]
    fn opt_out_and_folder_changes_reject_in_flight_reads() {
        let (desired, receiver) = watch::channel(Desired::Off);
        let mut model = Model {
            enabled: false,
            data_dir: None,
            epoch: 0,
            shutdown: false,
            desired,
        };
        let mut settings = Settings {
            discord_presence: true,
            ..Settings::default()
        };
        model.configure(&settings);
        let first = model.epoch;
        model.accept(first, Activity::Playing);
        assert_eq!(*receiver.borrow(), Desired::Show(Activity::Playing));
        settings.data_dir = Some("other".into());
        model.configure(&settings);
        model.accept(first, Activity::Playing);
        assert_eq!(*receiver.borrow(), Desired::Show(Activity::Launcher));
        settings.discord_presence = false;
        model.configure(&settings);
        model.accept(model.epoch, Activity::Playing);
        assert_eq!(*receiver.borrow(), Desired::Off);
    }
}
