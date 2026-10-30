// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Bounded supervision of the crate helper; this module has no Discord protocol.
use super::{
    Desired,
    helper::{Command, FLAG},
};
use std::{io, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout},
    sync::watch,
    time::{Instant, timeout},
};

const REPLY_TIMEOUT: Duration = Duration::from_secs(3);
const HEARTBEAT: Duration = Duration::from_secs(2);
const CLEAR_BUDGET: Duration = Duration::from_millis(500);

struct Helper {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}
impl Helper {
    fn spawn(mut command: tokio::process::Command) -> io::Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn()?;
        let input = child.stdin.take().ok_or(io::ErrorKind::BrokenPipe)?;
        let output = BufReader::new(child.stdout.take().ok_or(io::ErrorKind::BrokenPipe)?);
        Ok(Self {
            child,
            input,
            output,
        })
    }

    async fn exchange(&mut self, command: Command) -> io::Result<bool> {
        let mut bytes = serde_json::to_vec(&command)?;
        bytes.push(b'\n');
        self.input.write_all(&bytes).await?;
        self.input.flush().await?;
        let mut reply = Vec::new();
        (&mut self.output)
            .take(16)
            .read_until(b'\n', &mut reply)
            .await?;
        match reply.as_slice() {
            b"ok\n" | b"ok\r\n" | b"stopped\n" | b"stopped\r\n" => Ok(true),
            b"waiting\n" | b"waiting\r\n" => Ok(false),
            _ => Err(io::ErrorKind::InvalidData.into()),
        }
    }

    async fn stop(mut self) -> bool {
        // The package owns clear_activity. If it cannot answer, closing/killing
        // its process also disconnects that process's own Discord activity.
        let _ = timeout(CLEAR_BUDGET, self.exchange(Command::Stop)).await;
        let _ = self.child.start_kill();
        matches!(
            timeout(Duration::from_millis(200), self.child.wait()).await,
            Ok(Ok(_))
        )
    }
}

fn command() -> io::Result<tokio::process::Command> {
    let mut command = tokio::process::Command::new(std::env::current_exe()?);
    command.arg(FLAG);
    Ok(command)
}

pub(super) async fn run(desired: watch::Receiver<Desired>) {
    supervise(desired, command).await;
}

async fn supervise(
    mut desired: watch::Receiver<Desired>,
    mut command: impl FnMut() -> io::Result<tokio::process::Command>,
) {
    let mut backoff = 1;
    loop {
        let state = *desired.borrow_and_update();
        match state {
            Desired::Shutdown => return,
            Desired::Off => {
                if desired.changed().await.is_err() {
                    return;
                }
                backoff = 1;
                continue;
            }
            Desired::Show(_) => {}
        }
        if let Ok(mut helper) = command().and_then(Helper::spawn) {
            let mut activity = match state {
                Desired::Show(activity) => activity,
                _ => unreachable!(),
            };
            let mut waiting_since = Instant::now();
            loop {
                // Once an exchange starts, any change cancels it by stopping the
                // entire helper; never reuse a partially read response.
                let reply = tokio::select! {
                    biased;
                    _ = desired.changed() => break,
                    result = timeout(REPLY_TIMEOUT, helper.exchange(Command::Show(activity))) => result,
                };
                match reply {
                    Ok(Ok(true)) => {
                        waiting_since = Instant::now();
                        backoff = 1;
                    }
                    Ok(Ok(false)) if waiting_since.elapsed() < Duration::from_secs(30) => {}
                    _ => break,
                }
                tokio::select! {
                    _ = tokio::time::sleep(HEARTBEAT) => {},
                    result = desired.changed() => {
                        if result.is_err() { break; }
                        match *desired.borrow_and_update() {
                            Desired::Show(next) => activity = next,
                            _ => break,
                        }
                    },
                }
            }
            let _ = helper.stop().await;
        }
        if !matches!(*desired.borrow(), Desired::Show(_)) {
            continue;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(backoff)) => {},
            result = desired.changed() => if result.is_err() { return; },
        }
        backoff = (backoff * 2).min(30);
    }
}

#[cfg(test)]
mod tests;
