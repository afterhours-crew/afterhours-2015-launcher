// Release versions, compared the semver way. Shared by the window (update
// decisions) and the Node scripts (pin bumps), so it uses only syntax Node
// can strip types from: no enums, no imports.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers, empty for a release. */
  pre: string[];
}

const PATTERN =
  /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/** `1.2.3`, `v1.2.3` or `v1.2.3-rc.1`; build metadata is ignored. */
export function parseVersion(text: string): Version | null {
  const match = PATTERN.exec(text.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Math.sign(Number(a) - Number(b));
  if (numericA) return -1;
  if (numericB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative, zero or positive like a sort comparator; `null` when either is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (const key of ["major", "minor", "patch"] as const) {
    if (x[key] !== y[key]) return Math.sign(x[key] - y[key]);
  }
  // A release outranks its pre-releases.
  if (x.pre.length === 0 || y.pre.length === 0) return Math.sign(y.pre.length - x.pre.length);
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const order = compareIdentifiers(x.pre[i]!, y.pre[i]!);
    if (order !== 0) return order;
  }
  return Math.sign(x.pre.length - y.pre.length);
}

/** Whether `candidate` is strictly newer than `current`; false when either is invalid. */
export function isNewer(candidate: string, current: string): boolean {
  const order = compareVersions(candidate, current);
  return order !== null && order > 0;
}
