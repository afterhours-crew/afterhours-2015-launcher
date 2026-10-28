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
    starter: Option<&str>,
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
    // An item definition GUID: the server checks it is one of the preview's starters.
    if starter.is_some_and(|id| !hex(id, 32)) {
        return Err("Invalid first car.".into());
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
    if let Some(id) = starter {
        args.extend(["--starter".into(), id.into()]);
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
    starter: Option<String>,
) -> Result<cli::CliResult, String> {
    let settings = crate::reads::settings_of(&state);
    run(arguments(
        &settings,
        &account_id,
        &target,
        None,
        starter.as_deref(),
    )?)
    .await
}
#[tauri::command]
pub async fn story_apply(
    state: State<'_, crate::AppState>,
    account_id: String,
    target: String,
    expected_generation: String,
    plan_id: String,
    starter: Option<String>,
) -> Result<cli::CliResult, String> {
    let settings = crate::reads::settings_of(&state);
    run(arguments(
        &settings,
        &account_id,
        &target,
        Some((&expected_generation, &plan_id)),
        starter.as_deref(),
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
        assert!(arguments(&settings, &account, "after-intro", None, None).is_err());
        assert!(
            arguments(
                &settings,
                &account,
                "after-intro",
                Some(("1", &"b".repeat(64))),
                None
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
            None,
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
            assert!(arguments(&settings, &id, bad, None, None).is_err());
        }
        assert!(arguments(&settings, "--data-dir", "after-intro", None, None).is_err());
        assert!(arguments(&settings, &id, "after-intro", Some(("01", &plan)), None).is_err());
        assert!(arguments(&settings, &id, "after-intro", Some(("1", "--help")), None).is_err());
        assert!(
            arguments(&settings, &id, "after-intro", None, None)
                .unwrap()
                .ends_with(&["--preview".into(), "after-intro".into()])
        );
    }
    #[test]
    fn a_first_car_is_one_guid_passed_last_on_preview_and_apply() {
        let id = "01".repeat(16);
        let plan = "a".repeat(64);
        let car = "592ac0f528a4f4a56d80ff6c290f2f54";
        let settings = Settings::default();
        assert!(
            arguments(&settings, &id, "after-intro", None, Some(car))
                .unwrap()
                .ends_with(&["--starter".into(), car.into()])
        );
        let apply =
            arguments(&settings, &id, "after-intro", Some(("1", &plan)), Some(car)).unwrap();
        assert_eq!(&apply[apply.len() - 2..], ["--starter", car]);
        for bad in [
            "",
            "--server",
            "592AC0F528A4F4A56D80FF6C290F2F54",
            &"0".repeat(31),
        ] {
            assert!(arguments(&settings, &id, "after-intro", None, Some(bad)).is_err());
        }
    }
}
