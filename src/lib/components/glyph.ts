// The type of a Tabler icon component. Taken from one icon rather than the
// package's index, which would pull every icon into type checking; all
// icons share the same props.
import type IconPoint from "@tabler/icons-svelte/icons/point";

export type Glyph = typeof IconPoint;
