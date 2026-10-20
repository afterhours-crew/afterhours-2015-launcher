// Generates src/lib/styles/tokens.css from design/tokens.json.
//
// design/tokens.json is the design system's token file, copied verbatim.
// Every token becomes a CSS custom property on :root so components never
// hard-code a color, size, radius or blur. Aliases such as "{crew}" become
// var() references. Type styles become utility classes named .t-<style>,
// sentence case unless the style names a textTransform.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../design/tokens.json");
const target = resolve(here, "../src/lib/styles/tokens.css");
const tokens = JSON.parse(readFileSync(source, "utf8"));

const lines = [
  `/* Generated from design/tokens.json by scripts/tokens.mjs. Do not edit. */`,
  `:root {`,
];

function value(raw) {
  const alias = /^\{([A-Za-z0-9_.-]+)\}$/.exec(String(raw));
  return alias ? `var(--${alias[1]})` : raw;
}

for (const family of ["color", "spacing", "radius", "shadow", "size"]) {
  const group = tokens[family];
  if (!group?.tokens) continue;
  lines.push(`  /* ${family} */`);
  for (const token of group.tokens) {
    lines.push(`  --${token.name}: ${value(token.value)};`);
  }
}

lines.push(`  /* type families */`);
for (const [name, stack] of Object.entries(tokens.type.families)) {
  lines.push(`  --font-${name}: ${stack};`);
}
lines.push(`}`, ``);

for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    const decl = [
      `font-family: var(--font-${group.family});`,
      `font-size: ${style.fontSize};`,
      `line-height: ${style.lineHeight};`,
      `font-weight: ${style.fontWeight};`,
    ];
    if (style.letterSpacing) decl.push(`letter-spacing: ${style.letterSpacing};`);
    // Sentence case unless a style says otherwise (only event-type tags do).
    if (style.textTransform) decl.push(`text-transform: ${style.textTransform};`);
    // Figures line up wherever numbers are data: the clock, counts, money, times.
    if (group.name === "Data" || style.name === "clock")
      decl.push(`font-variant-numeric: tabular-nums;`);
    lines.push(`/* ${style.usage} */`, `.t-${style.name} { ${decl.join(" ")} }`, ``);
  }
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, lines.join("\n"));
console.log(`wrote ${target}`);
