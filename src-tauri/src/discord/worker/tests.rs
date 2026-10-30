// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;
use crate::discord::Activity;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

// A child process really uses the same pipes, deadlines, kill and reap path.
// These fixtures never connect to Discord, the server, or the game.
fn fixture(mode: &str) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let script = match mode {
            "silent" => "[Console]::ReadLine() | Out-Null; [Threading.Thread]::Sleep(60000)",
            "invalid" => {
                "[Console]::ReadLine() | Out-Null; [Console]::WriteLine('invalid'); [Threading.Thread]::Sleep(60000)"
            }
            _ => {
                "while ($null -ne ($line = [Console]::ReadLine())) { if ($line -eq '\"stop\"') { [Console]::WriteLine('stopped'); exit 0 }; [Console]::WriteLine('ok') }"
            }
        };
        let mut command = tokio::process::Command::new("powershell.exe");
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ]);
        command
    }
    #[cfg(not(windows))]
    {
        let script = match mode {
            "silent" => "read -r line; exec sleep 60",
            "invalid" => "read -r line; echo invalid; exec sleep 60",
            _ => {
                "while IFS= read -r line; do case \"$line\" in '\"stop\"') echo stopped; exit;; *) echo ok;; esac; done"
            }
        };
        let mut command = tokio::process::Command::new("/bin/sh");
        command.args(["-c", script]);
        command
    }
}

#[test]
fn actual_child_pipe_ack_and_graceful_shutdown() {
    runtime().block_on(async {
        let mut helper = Helper::spawn(fixture("ok")).unwrap();
        assert!(
            timeout(
                REPLY_TIMEOUT,
                helper.exchange(Command::Show(Activity::Playing))
            )
            .await
            .unwrap()
            .unwrap()
        );
        assert!(helper.stop().await, "helper reaped");
    });
}

#[test]
fn silent_child_is_timed_out_then_killed_and_reaped() {
    runtime().block_on(async {
        let mut helper = Helper::spawn(fixture("silent")).unwrap();
        assert!(
            timeout(
                REPLY_TIMEOUT,
                helper.exchange(Command::Show(Activity::Launcher))
            )
            .await
            .is_err()
        );
        let start = Instant::now();
        assert!(helper.stop().await);
        assert!(start.elapsed() < Duration::from_secs(1));
    });
}

#[test]
fn malformed_child_response_is_rejected() {
    runtime().block_on(async {
        let mut helper = Helper::spawn(fixture("invalid")).unwrap();
        assert!(
            timeout(
                REPLY_TIMEOUT,
                helper.exchange(Command::Show(Activity::Hosting))
            )
            .await
            .unwrap()
            .is_err()
        );
        assert!(helper.stop().await);
    });
}

#[test]
fn off_never_starts_a_helper_and_missing_helper_retries_are_bounded() {
    runtime().block_on(async {
        let (sender, receiver) = watch::channel(Desired::Off);
        let attempts = Arc::new(AtomicUsize::new(0));
        let count = attempts.clone();
        let worker = tokio::spawn(supervise(receiver, move || {
            count.fetch_add(1, Ordering::SeqCst);
            Err(io::ErrorKind::NotFound.into())
        }));
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 0);
        sender.send_replace(Desired::Show(Activity::Launcher));
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        sender.send_replace(Desired::Off);
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        sender.send_replace(Desired::Show(Activity::Playing));
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        sender.send_replace(Desired::Shutdown);
        timeout(Duration::from_secs(1), worker)
            .await
            .unwrap()
            .unwrap();
    });
}

#[test]
fn shutdown_cancels_a_pending_reply_without_waiting_for_its_deadline() {
    runtime().block_on(async {
        let (sender, receiver) = watch::channel(Desired::Show(Activity::Launcher));
        let (started, seen) = tokio::sync::oneshot::channel();
        let mut started = Some(started);
        let worker = tokio::spawn(supervise(receiver, move || {
            if let Some(started) = started.take() {
                let _ = started.send(());
            }
            Ok(fixture("silent"))
        }));
        seen.await.unwrap();
        sender.send_replace(Desired::Shutdown);
        timeout(Duration::from_secs(1), worker)
            .await
            .unwrap()
            .unwrap();
    });
}
