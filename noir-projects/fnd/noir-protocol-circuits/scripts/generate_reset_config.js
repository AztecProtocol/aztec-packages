#!/usr/bin/env node

// Writes `private_kernel_reset_config.json`: the reset-kernel variant catalog from
// `private_kernel_reset_variants.json` with a measured `cost` on every entry. Each cost is the
// `circuit_size` that `bb gates --scheme chonk` reports for that variant's compiled artifact.
//
// The config is build output rather than source, because the costs move with every change to the
// reset circuits, their dependencies, the Noir compiler, or bb. It is git-ignored here and shipped
// in `@aztec-foundation/protocol-circuits-artifacts`, where the variant selector reads it.
//
// Prerequisites:
//   - barretenberg `bb` binary built (../../../barretenberg/cpp/build/bin/bb, or set BB)
//   - Catalog variants compiled (run noir-projects/fnd/noir-protocol-circuits/bootstrap.sh)
//
// Usage:
//   node scripts/generate_reset_config.js

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const VARIANTS_FILE = path.join(ROOT, "private_kernel_reset_variants.json");
const CONFIG_FILE = path.join(ROOT, "private_kernel_reset_config.json");
const TARGET_DIR = path.join(ROOT, "target");
const BB =
  process.env.BB || path.resolve(ROOT, "../../../barretenberg/cpp/build/bin/bb");

const FULL = [64, 64, 64, 64, 64, 64, 64, 64, 64];

// Map each catalog group to the artifact-name prefix used by its compiled variants. The full-shape
// variant (every dimension equal to 64) lives at <prefix>.json; all others at <prefix>_<tag>.json.
const GROUP_PREFIXES = {
  inner: "private_kernel_reset",
  finalTail: "private_kernel_reset_tail",
  finalTailToPublic: "private_kernel_reset_tail_to_public",
};

function tagOf(dims) {
  return dims.join("_");
}

function isFull(dims) {
  return dims.every((v, i) => v === FULL[i]);
}

function artifactPath(group, dims) {
  const prefix = GROUP_PREFIXES[group];
  const name = isFull(dims) ? prefix : `${prefix}_${tagOf(dims)}`;
  return path.join(TARGET_DIR, `${name}.json`);
}

// `bb gates` prints a JSON report as the last thing on stdout, possibly after log lines.
function parseCircuitSize(out) {
  const match = out.match(/\{[\s\S]*"functions"[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(`Failed to parse bb gates output:\n${out}`);
  }
  return JSON.parse(match[0]).functions[0].circuit_size;
}

function measureCircuitSize(group, dims) {
  const out = execFileSync(
    BB,
    ["gates", "-b", artifactPath(group, dims), "--scheme", "chonk"],
    { encoding: "utf8" },
  );
  return parseCircuitSize(out);
}

// Attaches a `cost` to every catalog entry, keeping the catalog's group and entry order. `measure`
// is called with the entry's group and dimensions.
function buildConfig(variants, measure) {
  return Object.fromEntries(
    Object.keys(GROUP_PREFIXES).map((group) => [
      group,
      variants[group].map((entry) => ({
        ...entry,
        cost: measure(group, entry.dimensions),
      })),
    ]),
  );
}

// One catalog entry per line, matching the layout of the hand-edited variants file.
function serialize(config) {
  const entryLine = (e) =>
    `    { "name": ${JSON.stringify(e.name)}, "dimensions": [${e.dimensions.join(", ")}], "cost": ${e.cost} }`;
  const groupBlock = (entries) => entries.map(entryLine).join(",\n");
  const blocks = Object.keys(config).map(
    (g) => `  ${JSON.stringify(g)}: [\n${groupBlock(config[g])}\n  ]`,
  );
  return ["{", blocks.join(",\n"), "}", ""].join("\n");
}

function main() {
  const variants = JSON.parse(fs.readFileSync(VARIANTS_FILE, "utf8"));
  const config = buildConfig(variants, (group, dims) => {
    const cost = measureCircuitSize(group, dims);
    console.log(`${group} [${tagOf(dims)}] cost=${cost}`);
    return cost;
  });
  fs.writeFileSync(CONFIG_FILE, serialize(config));
  console.log(`Wrote ${CONFIG_FILE}`);
}

module.exports = { artifactPath, buildConfig, parseCircuitSize, serialize };

if (require.main === module) {
  main();
}
