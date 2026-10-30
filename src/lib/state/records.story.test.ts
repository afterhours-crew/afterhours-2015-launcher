import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, StoryReport, StoryPreview } from "$lib/api/types";
import { SAMPLE_PROFILE } from "./sample";
import { StoryEditor } from "./story-editor";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  story: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  list: vi.fn(),
  session: {
    settings: { data_dir: "first", server: null as { url: string } | null },
    info: { server: { capabilities: ["profile", "story", "story-preview"] } },
  },
}));
vi.mock("$lib/api/tauri", () => ({
  inTauri: false,
  api: {
    profile: mocks.profile,
    story: mocks.story,
    storyPreview: mocks.preview,
    storyApply: mocks.apply,
    profileList: mocks.list,
  },
}));
vi.mock("./session.svelte", () => ({ session: mocks.session }));
vi.mock("./preview", () => ({ sampleMode: false, loadSample: null }));
const { Records, current } = await import("./records.svelte");
const account = "01".repeat(16);
const ok = (value: unknown) => ({ kind: "ok", value });
const profile = (name: string): Profile => ({
  ...SAMPLE_PROFILE,
  account_id: account,
  cars: SAMPLE_PROFILE.cars!.map((car) => ({ ...car, name, location: "active" })),
});
const progress = (generation: string): StoryReport => ({
  version: 1,
  account_id: account,
  generation,
  current_checkpoint: generation === "1" ? "1" : "after-intro",
  intro_completed: generation !== "1",
  session_running: false,
  can_edit: true,
  warnings: [],
  checkpoints: ["1", "after-intro"].map((id) => ({
    id,
    label: id,
    active: id === "1",
    completed: false,
    played: false,
    edited: false,
    existing: false,
    reward_claimed: false,
    selectable: true,
  })),
});
const plan: StoryPreview = {
  version: 1,
  account_id: account,
  generation: "1",
  source_checkpoint: "1",
  target_checkpoint: "after-intro",
  operation_id: "2",
  plan_id: "a".repeat(64),
  completes: [],
  reopens: [],
  can_apply: true,
  reasons: [],
  starters: [],
  starter: null,
  car_images: null,
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.settings = { data_dir: "first", server: null };
  mocks.list.mockResolvedValue(ok({ version: 1, accounts: [] }));
  mocks.story.mockResolvedValue(ok(progress("2")));
});
describe("authoritative profile after a story write", () => {
  it("removes the old car immediately and renders an empty garage after restart", async () => {
    const records = new Records();
    records.profile = { kind: "ready", value: profile("Old car") };
    const reply = deferred<ReturnType<typeof ok>>();
    mocks.profile.mockReturnValueOnce(reply.promise);
    const refresh = records.refreshAfterStory(account);
    await flush();
    expect(current(records.profile)).toBeNull();
    reply.resolve(ok({ ...profile(""), cars: [] }));
    await refresh;
    expect(current(records.profile)?.cars).toEqual([]);
    expect(records.pickedProfile.kind).toBe("idle");
  });
  it("drives Apply through the actual records path and replaces the displayed car", async () => {
    const records = new Records();
    records.profile = { kind: "ready", value: profile("Old car") };
    records.story = { kind: "ready", value: progress("1") };
    mocks.preview.mockResolvedValue(ok(plan));
    mocks.apply.mockResolvedValue(
      ok({
        version: 1,
        account_id: account,
        previous_generation: "1",
        generation: "2",
        target_checkpoint: "after-intro",
        starter: null,
        replayed: false,
        backup: { id: "b".repeat(64), database_sha256: "c".repeat(64), generation: "1" },
      }),
    );
    mocks.profile.mockResolvedValue(ok(profile("Chosen car")));
    const editor = new StoryEditor(
      { preview: (a, t, s) => records.previewStory(a, t, s), apply: (p) => records.applyStory(p) },
      () => ({ scope: "first", story: current(records.story), fresh: true, canPreview: true }),
      () => {},
      (a) => records.refreshAfterStory(a),
    );
    editor.select("after-intro");
    await flush();
    await editor.apply();
    expect(mocks.apply).toHaveBeenCalledOnce();
    expect(current(records.profile)?.cars?.[0]?.name).toBe("Chosen car");
    expect(current(records.story)?.generation).toBe("2");
  });
  it("does not let a pre-Apply read replace the new car", async () => {
    const records = new Records();
    const old = deferred<ReturnType<typeof ok>>();
    mocks.profile.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(profile("New car")));
    const older = records.loadProfile();
    await flush();
    await records.refreshAfterStory(account);
    old.resolve(ok(profile("Old car")));
    await older;
    expect(current(records.profile)?.cars?.[0]?.name).toBe("New car");
  });
  it("clears stale car details and exposes a failed refresh", async () => {
    const records = new Records();
    records.profile = { kind: "ready", value: profile("Old car") };
    mocks.profile.mockResolvedValue({ kind: "error", exit: 5, message: "Read refused" });
    await records.refreshAfterStory(account);
    expect(records.profile).toMatchObject({ kind: "error", last: null });
    expect(current(records.profile)).toBeNull();
  });
  it("rejects a response for another selected driver", async () => {
    const records = new Records();
    mocks.profile.mockResolvedValue(
      ok({ ...profile("Other driver"), account_id: "02".repeat(16) }),
    );
    await records.refreshAfterStory(account);
    expect(records.profile.kind).toBe("error");
    expect(current(records.profile)).toBeNull();
  });
  it("ignores an old local response after changing servers", async () => {
    const records = new Records();
    const local = deferred<ReturnType<typeof ok>>();
    mocks.profile
      .mockReturnValueOnce(local.promise)
      .mockResolvedValueOnce(ok(profile("Remote car")));
    const pending = records.loadProfile();
    await flush();
    mocks.session.settings.server = { url: "http://192.168.1.2:61000" };
    await records.switchServer();
    local.resolve(ok(profile("Local car")));
    await pending;
    expect(current(records.profile)?.cars?.[0]?.name).toBe("Remote car");
  });
});
