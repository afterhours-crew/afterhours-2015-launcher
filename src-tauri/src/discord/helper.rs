// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The same launcher executable, without Tauri/window/server initialization.
//! discord-presence owns discovery, framing, activity and reconnects on all OSes.
//! Its synchronous calls stay here: the parent can terminate a stuck helper.

use super::{APPLICATION_ID, Activity};
use discord_presence::Client;
use serde::{Deserialize, Serialize};
use std::{
    io::{self, BufRead, Write},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

pub(super) const FLAG: &str = "--afterhours-discord-presence";
pub(super) const MAX_COMMAND: u64 = 128;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum Command {
    Show(Activity),
    Stop,
}

/// Return true only for the private helper entry point. No settings, tokens,
/// profile data or server paths are passed to this process.
pub(crate) fn entry() -> bool {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new(FLAG)) {
        return false;
    }
    if args.next().is_some() {
        return true;
    }
    // A separate bounded stdin reader notices the parent's death even if the
    // crate is stuck waiting for Discord. Closing all pipe handles clears RPC.
    let (sender, commands) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let stdin = io::stdin();
        let mut input = stdin.lock();
        while let Ok(command) = read_command(&mut input) {
            // Never block this reader: EOF must still terminate a helper whose
            // library call stalled. The parent permits only one pending request.
            if sender.try_send(command).is_err() {
                break;
            }
        }
        // This is exclusively the private helper process, never the main window.
        std::process::exit(0);
    });
    let _ = serve(commands, io::stdout().lock());
    true
}

fn read_command(input: &mut impl BufRead) -> io::Result<Command> {
    let mut bytes = Vec::new();
    std::io::Read::take(&mut *input, MAX_COMMAND + 1).read_until(b'\n', &mut bytes)?;
    if bytes.len() as u64 > MAX_COMMAND || bytes.last() != Some(&b'\n') {
        return Err(io::ErrorKind::InvalidData.into());
    }
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

#[derive(Default)]
struct Published {
    last: Option<(Activity, u64, Instant)>,
}
impl Published {
    fn due(&self, activity: Activity, generation: u64, now: Instant) -> bool {
        self.last.is_none_or(|(last, previous, time)| {
            previous != generation
                || (last != activity && now.duration_since(time) >= Duration::from_secs(15))
        })
    }
}

fn serve(commands: mpsc::Receiver<Command>, mut output: impl Write) -> io::Result<()> {
    let first = commands.recv().map_err(|_| io::ErrorKind::BrokenPipe)?;
    if matches!(first, Command::Stop) {
        output.write_all(b"stopped\n")?;
        return output.flush();
    }
    let connected = Arc::new(AtomicBool::new(false));
    let generation = Arc::new(AtomicU64::new(0));
    let mut client = Client::with_error_config(APPLICATION_ID, Duration::from_secs(1), None);
    let ready = connected.clone();
    let current = generation.clone();
    let _connected = client.on_connected(move |_| {
        current.fetch_add(1, Ordering::SeqCst);
        ready.store(true, Ordering::SeqCst);
    });
    let ready = connected.clone();
    let _disconnected = client.on_disconnected(move |_| {
        ready.store(false, Ordering::SeqCst);
    });
    // No logger and no user-data callbacks: crate payloads never reach logs/parent.
    client.start();
    let mut published = Published::default();
    for command in std::iter::once(first).chain(commands) {
        match command {
            Command::Stop => {
                if connected.load(Ordering::SeqCst) {
                    let _ = client.clear_activity();
                }
                let _ = client.shutdown();
                output.write_all(b"stopped\n")?;
                output.flush()?;
                return Ok(());
            }
            Command::Show(activity) => {
                let ready = connected.load(Ordering::SeqCst);
                let current = generation.load(Ordering::SeqCst);
                let now = Instant::now();
                if ready && published.due(activity, current, now) {
                    client
                        .set_activity(|_| activity.payload())
                        .map_err(|_| io::ErrorKind::ConnectionAborted)?;
                    published.last = Some((activity, current, Instant::now()));
                }
                output.write_all(if ready { b"ok\n" } else { b"waiting\n" })?;
                output.flush()?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_helper_input_accepts_only_our_enum() {
        assert!(matches!(
            read_command(
                &mut br#"{"show":"playing"}
"#
                .as_slice()
            )
            .unwrap(),
            Command::Show(Activity::Playing)
        ));
        for bytes in [
            b"\"stop\"".to_vec(),
            b"{\"show\":\"private player\"}\n".to_vec(),
            vec![b'x'; 200],
        ] {
            assert!(read_command(&mut bytes.as_slice()).is_err());
        }
    }
    #[test]
    fn changes_coalesce_but_reconnect_republishes() {
        let now = Instant::now();
        let mut published = Published::default();
        assert!(published.due(Activity::Launcher, 1, now));
        published.last = Some((Activity::Launcher, 1, now));
        assert!(!published.due(Activity::Launcher, 1, now + Duration::from_secs(60)));
        assert!(!published.due(Activity::Playing, 1, now + Duration::from_secs(5)));
        assert!(published.due(Activity::Playing, 1, now + Duration::from_secs(15)));
        assert!(published.due(Activity::Launcher, 2, now + Duration::from_secs(1)));
    }
}
