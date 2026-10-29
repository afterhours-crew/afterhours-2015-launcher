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
