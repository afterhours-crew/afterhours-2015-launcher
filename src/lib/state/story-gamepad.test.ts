import { expect, it } from "vitest";
import { StoryPad } from "./story-gamepad";

function input(pressed: number[] = [], axes = [0, 0], id = "pad") {
  return {
    index: 0,
    id,
    mapping: "standard" as GamepadMappingType,
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: pressed.includes(i),
      touched: false,
      value: pressed.includes(i) ? 1 : 0,
    })),
  };
}

it("never applies from a held button on connection, focus return or controller replacement", () => {
  const pad = new StoryPad();
  expect(pad.read(input([0]), true)).toEqual([]);
  expect(pad.read(input([0]), true)).toEqual([]);
  expect(pad.read(input(), true)).toEqual([]);
  expect(pad.read(input([0]), true)).toEqual(["activate"]);
  expect(pad.read(input([0]), false)).toEqual([]);
  expect(pad.read(input([0]), true)).toEqual([]);
  expect(pad.read(input([0], [0, 0], "replacement"), true)).toEqual([]);
});

it("requires release between navigation and rejects ambiguous actions", () => {
  const pad = new StoryPad();
  pad.read(input(), true);
  expect(pad.read(input([15]), true)).toEqual(["next"]);
  expect(pad.read(input([15]), true)).toEqual([]);
  pad.read(input(), true);
  expect(pad.read(input([0, 1]), true)).toEqual([]);
  pad.read(input(), true);
  expect(pad.read(input([], [-0.8, 0]), true)).toEqual(["previous"]);
  expect(pad.read(input([], [-0.75, 0]), true)).toEqual([]);
  pad.read(input([], [-0.1, 0]), true);
  expect(pad.read(input([1]), true)).toEqual(["cancel"]);
  expect(pad.read(null, true)).toEqual([]);
});
