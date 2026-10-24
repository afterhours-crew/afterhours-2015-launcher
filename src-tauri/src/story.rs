// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Checkpoint commands delegate ownership, backups and save writes to the server.
use crate::{cli, server, settings::Settings};
use std::time::Duration;
use tauri::State;

fn decimal(value: &str) -> bool {
    value.parse::<u64>().is_ok_and(|v| v.to_string() == value)
}
fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn arguments(
    settings: &Settings,
    account: &str,
    target: &str,
    proof: Option<(&str, &str)>,
) -> Result<Vec<String>, String> {
    if settings.server.is_some() {
        return Err("Change story checkpoints from the launcher on the server's own PC.".into());
    }
    if !hex(account, 32) || account.bytes().all(|b| b == b'0') {
        return Err("Invalid story account.".into());
    }
    if target != "after-intro" && (!decimal(target) || target == "0") {
        return Err("Invalid story checkpoint.".into());
    }
    let mut args = cli::global_args(settings);
    args.extend(["story".into(), "--account-id".into(), account.into()]);
    match proof {
        None => args.extend(["--preview".into(), target.into()]),
        Some((generation, plan)) => {
            if !decimal(generation) || !hex(plan, 64) {
                return Err("Refresh the story preview before applying.".into());
            }
            args.extend([
                "--apply".into(),
                target.into(),
                "--expected-generation".into(),
                generation.into(),
                "--plan-id".into(),
                plan.into(),
            ]);
        }
    }
    Ok(args)
}
async fn run(args: Vec<String>) -> Result<cli::CliResult, String> {
    let server = server::current()?;
    // The server helper has its own 30-second bound; leave time to return its
    // result and ensure a timeout never triggers an automatic write retry.
    tauri::async_runtime::spawn_blocking(move || {
        cli::run_json(&server.path, &args, Duration::from_secs(45))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn story_preview(
    state: State<'_, crate::AppState>,
    account_id: String,
    target: String,
) -> Result<cli::CliResult, String> {
    let settings = crate::reads::settings_of(&state);
    run(arguments(&settings, &account_id, &target, None)?).await
}
#[tauri::command]
pub async fn story_apply(
    state: State<'_, crate::AppState>,
    account_id: String,
    target: String,
    expected_generation: String,
    plan_id: String,
) -> Result<cli::CliResult, String> {
    let settings = crate::reads::settings_of(&state);
    run(arguments(
        &settings,
        &account_id,
        &target,
        Some((&expected_generation, &plan_id)),
    )?)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_remote_selection_never_falls_back_to_a_local_account() {
        let settings = Settings {
            server: Some(crate::settings::RemoteServer {
                url: "http://192.0.2.1:4317".into(),
                token: "a".repeat(64),
            }),
            ..Settings::default()
        };
        let account = "01".repeat(16);
        assert!(arguments(&settings, &account, "after-intro", None).is_err());
        assert!(
            arguments(
                &settings,
                &account,
                "after-intro",
                Some(("1", &"b".repeat(64)))
            )
            .is_err()
        );
    }
    #[test]
    fn exact_identifiers_remain_strings_and_untrusted_options_are_refused() {
        let id = "01".repeat(16);
        let plan = "a".repeat(64);
        let settings = Settings::default();
        let args = arguments(
            &settings,
            &id,
            "9007199254740993",
            Some(("9007199254740994", &plan)),
        )
        .unwrap();
        assert_eq!(
            &args[args.len() - 6..],
            [
                "--apply",
                "9007199254740993",
                "--expected-generation",
                "9007199254740994",
                "--plan-id",
                plan.as_str()
            ]
        );
        for bad in ["0", "07", "--server", "../save", "18446744073709551616"] {
            assert!(arguments(&settings, &id, bad, None).is_err());
        }
        assert!(arguments(&settings, "--data-dir", "after-intro", None).is_err());
        assert!(arguments(&settings, &id, "after-intro", Some(("01", &plan))).is_err());
        assert!(arguments(&settings, &id, "after-intro", Some(("1", "--help"))).is_err());
        assert!(
            arguments(&settings, &id, "after-intro", None)
                .unwrap()
                .ends_with(&["--preview".into(), "after-intro".into()])
        );
    }
}
