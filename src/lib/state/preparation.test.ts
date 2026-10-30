import { describe, expect, it } from "vitest";
import type { OutputLine } from "$lib/api/types";
import { preparationLine } from "./preparation";

const text = (text: string): OutputLine => ({ kind: "text", text });
const server = (message: string) =>
  text(`2026-10-29T18:37:59.101434Z  INFO nfs_server::prepared_content: ${message}`);

describe("startup preparation hints", () => {
  it("reports actual cache reuse and completed work without implying readiness", () => {
    expect(
      preparationLine([text("[content] Verified content cache reused; extraction skipped.")]),
    ).toBe("Game data loaded from cache");
    const progress = server(
      'runtime preparation progress phase="sprints" completed=7 total=26 workers=2',
    );
    expect(preparationLine([progress])).toBe("Preparing races · 7 of 26");
    expect(
      preparationLine([
        progress,
        server('static runtime content ready component="normal-sprints" source=Hit elapsed_ms=285'),
      ]),
    ).toBe("Races loaded from cache · preparing prologue");
    expect(
      preparationLine([
        server(
          'static runtime content ready component="complete-prologue" source=Missing elapsed_ms=10000',
        ),
      ]),
    ).toBe("Prologue prepared · finishing startup");
    expect(
      preparationLine([
        server(
          'static runtime content ready component="complete-prologue" source=Hit elapsed_ms=38',
        ),
      ]),
    ).toBe("Prologue loaded from cache · finishing startup");
  });
  it("falls back on unknown, stale, oversized or malformed diagnostics", () => {
    expect(preparationLine([])).toBeNull();
    expect(preparationLine([text("some other server is starting")])).toBeNull();
    for (const counts of [
      "completed=27 total=26",
      "completed=0 total=0",
      "completed=1 total=513",
      "completed=-1 total=26",
    ]) {
      expect(
        preparationLine([server(`runtime preparation progress phase="sprints" ${counts}`)]),
      ).toBeNull();
    }
    expect(
      preparationLine([text("[content] Verified content cache reused" + "x".repeat(4096))]),
    ).toBeNull();
    expect(
      preparationLine([
        server('runtime preparation progress phase="sprints" completed=1 total=26'),
        ...Array.from({ length: 400 }, () => text("unrelated")),
      ]),
    ).toBeNull();
    expect(
      preparationLine([{ kind: "status", time: "now", state: "ready", message: "all done" }]),
    ).toBeNull();
  });
});
