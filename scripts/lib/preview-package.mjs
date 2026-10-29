import { sha256, SIDECAR_TARGET } from "./pin.mjs";
import { join } from "node:path";
import { LAUNCHER_NAME, MARKER_NAME } from "./portable.mjs";

export function validatePreviewServer(info, bytes) {
  if (
    info?.dirty_source !== false ||
    info.target !== SIDECAR_TARGET ||
    !/^[0-9a-f]{40}$/.test(info.revision ?? "") ||
    typeof info.release !== "string" ||
    info.release === "development" ||
    !info.release ||
    info.executable_sha256 !== sha256(bytes) ||
    info.source?.toLowerCase() !==
      `https://github.com/afterhours-crew/afterhours-2015/tree/${info.revision}`
  ) {
    throw new Error(
      "Preview server needs a clean canonical package with matching target, source and executable hash.",
    );
  }
}

export function previewBundleConfig(input) {
  // Merge-patch removes the production notice paths. Its release pin and
  // verified sidecar remain intact; this explicit preview names its own files.
  return {
    bundle: {
      externalBin: [`${input}/Afterhours`],
      resources: {
        "binaries/afterhours-server/LICENSE": null,
        "binaries/afterhours-server/THIRD-PARTY-NOTICES.txt": null,
        "binaries/afterhours-server/build-info.json": null,
        [`${input}/LICENSE`]: "afterhours-server/LICENSE",
        [`${input}/THIRD-PARTY-NOTICES.txt`]: "afterhours-server/THIRD-PARTY-NOTICES.txt",
        [`${input}/build-info.json`]: "afterhours-server/build-info.json",
      },
    },
  };
}

// This uses the candidate input already checked by preview-package.mjs, never
// the release-pinned sidecar. Revalidate the bytes at the final packaging edge.
export function previewPortableLayout({ root, exe, input, info, bytes }) {
  validatePreviewServer(info, bytes);
  return [
    { from: exe, to: LAUNCHER_NAME },
    {
      from: join(input, `Afterhours-${SIDECAR_TARGET}.exe`),
      to: "Afterhours.exe",
      sha256: info.executable_sha256,
    },
    { from: join(root, "packaging", MARKER_NAME), to: MARKER_NAME },
    { from: join(root, "LICENSE"), to: "LICENSE" },
    ...["LICENSE", "THIRD-PARTY-NOTICES.txt", "build-info.json"].map((name) => ({
      from: join(input, name),
      to: `afterhours-server/${name}`,
    })),
  ];
}
