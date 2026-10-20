// Generates src/lib/api/generated/<name>.ts from schemas/<name>.schema.json.
//
// The schemas describe the JSON the bundled Afterhours.exe prints. A pin bump
// (scripts/server-pin.mjs bump) replaces them with the ones attached to the
// pinned server release; until the server publishes schemas, minimal copies
// are vendored here (schemas/README.md). The generator is
// json-schema-to-typescript at the exact version in package.json, and the
// output is formatted with this repository's Prettier settings, so CI can
// regenerate and diff. Never edit the generated files.
//
//   node scripts/gen-types.mjs [--schemas <dir>] [--out <dir>]
//                              other folders, to try a server branch's schemas
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import * as prettier from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : null;
};
const schemasDir = option("--schemas") ?? join(root, "schemas");
const outDir = option("--out") ?? join(root, "src", "lib", "api", "generated");

const schemas = readdirSync(schemasDir)
  .filter((name) => name.endsWith(".schema.json"))
  .sort();
if (schemas.length === 0) throw new Error("schemas/ holds no *.schema.json files.");

mkdirSync(outDir, { recursive: true });
const written = new Set();
for (const file of schemas) {
  const stem = file.replace(/\.schema\.json$/, "");
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf8"));
  const body = await compile(schema, schema.title ?? stem, {
    bannerComment: "",
    cwd: schemasDir,
    format: false,
    // Types list the fields the schema names; the server may add more.
    additionalProperties: false,
    declareExternallyReferenced: true,
    strictIndexSignatures: true,
    unknownAny: true,
  });
  const target = join(outDir, `${stem}.ts`);
  const text = [
    `// Generated from schemas/${file} by scripts/gen-types.mjs. Do not edit; run \`pnpm types\`.`,
    "",
    body,
  ].join("\n");
  const options = (await prettier.resolveConfig(target)) ?? {};
  writeFileSync(target, await prettier.format(text, { ...options, filepath: target }));
  written.add(`${stem}.ts`);
}
for (const name of readdirSync(outDir)) {
  if (!written.has(name)) rmSync(join(outDir, name));
}
console.log(`wrote ${[...written].join(", ")} in ${outDir}`);
