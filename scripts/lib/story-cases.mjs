import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storyFixture, storyInventory, STORY_ACCOUNT, STORY_STARTERS } from "./story-fixture.mjs";

export function storyCases({ dataDir, runJson, refusal, sha256 }) {
  const setup = (name) => {
    const dir = dataDir(name);
    const fixture = storyFixture(dir);
    return {
      dir,
      ...fixture,
      args: ["story", "--json", "--data-dir", dir, "--content-dir", fixture.content],
    };
  };
  return [
    {
      name: "story restart clears an existing car and permits a different choice after a verified backup",
      capability: "story-restart",
      schema: "story-apply",
      run() {
        const f = setup("story-restart-success");
        const change = (target, options) => {
          const preview = runJson([...f.args, "--preview", target, ...options], "story-preview");
          assert.equal(preview.can_apply, true);
          const args = [
            ...f.args,
            "--apply",
            target,
            ...options,
            "--expected-generation",
            preview.generation,
            "--plan-id",
            preview.plan_id,
          ];
          return { preview, args, result: runJson(args, "story-apply") };
        };
        change("after-intro", ["--starter", STORY_STARTERS[0]]);
        // Ordinary replay preserves the car, putting the save at the exact
        // already-at-opening state that originally made the UI misleading.
        change("101", []);
        assert.equal(storyInventory(f.database)[0].definition.toLowerCase(), STORY_STARTERS[0]);
        const before = storyInventory(f.database);
        const reset = change("101", ["--restart"]);
        assert.equal(reset.preview.restart, true);
        assert.equal(reset.result.restart, true);
        assert.deepEqual(storyInventory(f.database), []);
        assert.equal(runJson(f.args, "story").current_checkpoint, "101");
        const backup = join(
          f.dir,
          "artifacts",
          "story-backups",
          reset.result.backup.id,
          `${STORY_ACCOUNT}.sqlite`,
        );
        assert.equal(sha256(readFileSync(backup)), reset.result.backup.database_sha256);
        assert.deepEqual(storyInventory(backup), before);
        assert.equal(runJson(reset.args, "story-apply").replayed, true);
        const altered = reset.args.filter((arg) => arg !== "--restart");
        refusal(altered, 1);
        change("after-intro", ["--starter", STORY_STARTERS[2]]);
        assert.equal(storyInventory(f.database).length, 1);
        assert.equal(storyInventory(f.database)[0].definition.toLowerCase(), STORY_STARTERS[2]);
        refusal(reset.args, 1);
        return "fresh opening; old car only in verified backup; explicit intent; different starter; stale reset refused";
      },
    },
    {
      name: "story reads constructed objectives without changing the save",
      capability: "story",
      schema: "story",
      run() {
        const f = setup("story-readable");
        const before = sha256(readFileSync(f.database));
        const report = runJson(f.args, "story");
        assert.equal(report.account_id, STORY_ACCOUNT);
        assert.equal(report.current_checkpoint, "101");
        assert.equal(report.generation, "1");
        assert.deepEqual(
          report.checkpoints.map((p) => p.selectable),
          [true, false, false, true],
        );
        assert.equal(sha256(readFileSync(f.database)), before);
        return "opening/terminal selectable; middle markers disabled; database unchanged";
      },
    },
    {
      name: "story previews require a first car and refuse unsupported checkpoints",
      capability: "story-preview",
      schema: "story-preview",
      run() {
        const f = setup("story-preview-success");
        const before = sha256(readFileSync(f.database));
        const preview = runJson([...f.args, "--preview", "after-intro"], "story-preview");
        assert.equal(preview.can_apply, false);
        assert.equal(preview.starter, null);
        assert.deepEqual(
          preview.starters.map((c) => c.id),
          STORY_STARTERS,
        );
        const picked = runJson(
          [...f.args, "--preview", "after-intro", "--starter", STORY_STARTERS[1]],
          "story-preview",
        );
        assert.equal(picked.can_apply, true);
        assert.equal(picked.starter, STORY_STARTERS[1]);
        assert.notEqual(picked.plan_id, preview.plan_id);
        const middle = runJson([...f.args, "--preview", "103"], "story-preview");
        assert.equal(middle.can_apply, false);
        refusal(
          [
            ...f.args,
            "--apply",
            "103",
            "--expected-generation",
            middle.generation,
            "--plan-id",
            middle.plan_id,
          ],
          1,
        );
        assert.equal(sha256(readFileSync(f.database)), before);
        return "actual helper output; all first-car fields checked";
      },
    },
    {
      name: "story applies skip once, backs up the save, rewinds and preserves the car",
      capability: "story-preview",
      schema: "story-apply",
      run() {
        const f = setup("story-apply-success");
        const preview = runJson(
          [...f.args, "--preview", "after-intro", "--starter", STORY_STARTERS[1]],
          "story-preview",
        );
        const apply = [
          ...f.args,
          "--apply",
          "after-intro",
          "--starter",
          STORY_STARTERS[1],
          "--expected-generation",
          preview.generation,
          "--plan-id",
          preview.plan_id,
        ];
        const result = runJson(apply, "story-apply");
        assert.equal(result.starter, STORY_STARTERS[1]);
        assert.equal(result.generation, "2");
        assert.equal(result.replayed, false);
        const backup = join(
          f.dir,
          "artifacts",
          "story-backups",
          result.backup.id,
          `${STORY_ACCOUNT}.sqlite`,
        );
        assert.equal(sha256(readFileSync(backup)), result.backup.database_sha256);
        const cars = storyInventory(f.database);
        assert.equal(cars.length, 1);
        assert.equal(cars[0].definition.toLowerCase(), STORY_STARTERS[1]);
        const retry = runJson(apply, "story-apply");
        assert.equal(retry.replayed, true);
        assert.equal(retry.generation, "2");
        assert.deepEqual(storyInventory(f.database), cars);
        assert.equal(runJson(f.args, "story").current_checkpoint, "after-intro");
        const replay = runJson([...f.args, "--preview", "101"], "story-preview");
        assert.equal(replay.can_apply, true);
        assert.deepEqual(replay.starters, []);
        runJson(
          [
            ...f.args,
            "--apply",
            "101",
            "--expected-generation",
            replay.generation,
            "--plan-id",
            replay.plan_id,
          ],
          "story-apply",
        );
        assert.equal(runJson(f.args, "story").current_checkpoint, "101");
        assert.deepEqual(storyInventory(f.database), cars);
        refusal(apply, 1);
        assert.deepEqual(storyInventory(f.database), cars);
        return "backup verified; one car; exact retry inert; stale plan refused";
      },
    },
  ];
}
