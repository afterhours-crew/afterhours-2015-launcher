import { sha256, SIDECAR_TARGET } from "./pin.mjs";

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
