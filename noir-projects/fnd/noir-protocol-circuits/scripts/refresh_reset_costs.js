#!/usr/bin/env node

// Refresh the `cost` field on every reset-kernel catalog entry in
// `private_kernel_reset_config.json`. Each cost is the `circuit_size` reported by
// `bb gates --scheme chonk` for that variant's compiled artifact.
//
// Run this whenever the reset circuit source, its dependencies, or the noir compiler change.
// Otherwise the catalog costs go stale and the variant selector may pick a non-optimal variant.
//
// Prerequisites:
//   - barretenberg `bb` binary built (../../../barretenberg/cpp/build/bin/bb)
//   - Catalog variants compiled (run noir-projects/fnd/noir-protocol-circuits/bootstrap.sh)
//
// Usage:
//   node scripts/refresh_reset_costs.js            # measure and rewrite the config
//   node scripts/refresh_reset_costs.js --check     # measure only; exit 1 if any cost is stale

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "private_kernel_reset_config.json");
const TARGET_DIR = path.join(ROOT, "target");
const BB =
  process.env.BB || path.resolve(ROOT, "../../../barretenberg/cpp/build/bin/bb");

const FULL = [64, 64, 64, 64, 64, 64, 64, 64, 64];

function tagOf(dims) {
  return dims.join("_");
}

function isFull(dims) {
  return dims.every((v, i) => v === FULL[i]);
}

// Map each catalog group to the artifact-name prefix used by its compiled variants. The full-shape
// variant (every dimension equal to 64) lives at <prefix>.json; all others at <prefix>_<tag>.json.
const GROUP_PREFIXES = {
  inner: "private_kernel_reset",
  finalTail: "private_kernel_reset_tail",
  finalTailToPublic: "private_kernel_reset_tail_to_public",
};

function artifactPath(group, dims) {
  const prefix = GROUP_PREFIXES[group];
  const name = isFull(dims) ? prefix : `${prefix}_${tagOf(dims)}`;
  return path.join(TARGET_DIR, `${name}.json`);
}

function measureCircuitSize(group, dims) {
  const out = execFileSync(
    BB,
    ["gates", "-b", artifactPath(group, dims), "--scheme", "chonk"],
    { encoding: "utf8" },
  );
  const match = out.match(/\{[\s\S]*"functions"[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(
      `Failed to parse bb gates output for ${group}/[${tagOf(dims)}]:\n${out}`,
    );
  }
  return JSON.parse(match[0]).functions[0].circuit_size;
}

// Serialize the config keeping each catalog entry on a single line (matches the original
// human-edited format) so that future cost diffs are reviewable line-by-line.
function serialize(config) {
  const entryLine = (e) =>
    `    { "name": ${JSON.stringify(e.name)}, "dimensions": [${e.dimensions.join(", ")}], "cost": ${e.cost} }`;
  const groupBlock = (entries) => entries.map(entryLine).join(",\n");
  const groupNames = Object.keys(GROUP_PREFIXES);
  const blocks = groupNames.map(
    (g) => `  ${JSON.stringify(g)}: [\n${groupBlock(config[g])}\n  ]`,
  );
  return ["{", blocks.join(",\n"), "}", ""].join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

  const stale = [];
  for (const group of Object.keys(GROUP_PREFIXES)) {
    for (const entry of config[group]) {
      const before = entry.cost;
      const after = measureCircuitSize(group, entry.dimensions);
      entry.cost = after;
      const delta = before === undefined ? "(new)" : after - before;
      if (before !== after) {
        stale.push(
          `${group}/${entry.name} [${tagOf(entry.dimensions)}]: ${before} -> ${after}`,
        );
      }
      console.log(
        `${group}/${entry.name.padEnd(24)} [${tagOf(entry.dimensions)}] cost=${after} Δ=${delta}`,
      );
    }
  }

  if (checkOnly) {
    if (stale.length) {
      console.error(
        `\nprivate_kernel_reset_config.json is stale (${stale.length} cost(s) drifted):\n` +
          stale.map((s) => `  ${s}`).join("\n") +
          `\n\nRun 'node scripts/refresh_reset_costs.js' and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`\nAll reset costs are up to date.`);
    return;
  }

  fs.writeFileSync(CONFIG_FILE, serialize(config));
  console.log(`\nWrote ${CONFIG_FILE}`);
}

main();
