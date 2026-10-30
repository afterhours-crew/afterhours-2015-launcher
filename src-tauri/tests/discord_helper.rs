// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Exercise the real executable's private entry point. No Show command is sent,
//! so these cases never create a Discord client, GUI, server or game session.
use std::{
    io::Write,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[test]
fn helper_stop_and_parent_eof_exit_without_opening_the_application() {
    for request in [Some(b"\"stop\"\n".as_slice()), None] {
        let mut command = Command::new(env!("CARGO_BIN_EXE_afterhours-launcher"));
        command
            .arg("--afterhours-discord-presence")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().unwrap();
        let mut input = child.stdin.take();
        if let Some(request) = request {
            input.as_mut().unwrap().write_all(request).unwrap();
        } else {
            drop(input.take());
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while child.try_wait().unwrap().is_none() {
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("helper failed to exit within five seconds");
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        assert_eq!(
            output.stdout,
            if request.is_some() {
                b"stopped\n".as_slice()
            } else {
                b""
            }
        );
    }
}
