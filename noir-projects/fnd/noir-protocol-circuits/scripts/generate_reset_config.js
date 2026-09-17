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
const {
  families,
  getResetTag,
  isFullDimensions,
} = require("./reset_variants.js");

const ROOT = path.resolve(__dirname, "..");
const VARIANTS_FILE = path.join(ROOT, "private_kernel_reset_variants.json");
const CONFIG_FILE = path.join(ROOT, "private_kernel_reset_config.json");
const TARGET_DIR = path.join(ROOT, "target");
const BB =
  process.env.BB || path.resolve(ROOT, "../../../barretenberg/cpp/build/bin/bb");

// The build names a compiled artifact after its crate directory with dashes replaced: the template
// crate at <prefix>.json, every generated variant at <prefix>_<tag>.json.
function artifactPath(group, dims) {
  const family = families.find((f) => f.group === group);
  if (!family) {
    throw new Error(`No variant family for catalog group ${JSON.stringify(group)}`);
  }
  const prefix = family.realFolder.replace(/-/g, "_");
  const name = isFullDimensions(dims) ? prefix : `${prefix}_${getResetTag(dims)}`;
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
  try {
    return parseCircuitSize(out);
  } catch (e) {
    throw new Error(`${group} [${getResetTag(dims)}]: ${e.message}`);
  }
}

// Attaches a `cost` to every catalog entry, keeping the catalog's group and entry order. `measure`
// is called with the entry's group and dimensions and must return a positive integer: the file
// this writes is shipped, and nothing downstream validates it before the variant selector reads it.
function buildConfig(variants, measure) {
  return Object.fromEntries(
    Object.entries(variants).map(([group, entries]) => [
      group,
      entries.map((entry) => {
        const cost = measure(group, entry.dimensions);
        if (!Number.isInteger(cost) || cost <= 0) {
          throw new Error(
            `Invalid cost ${cost} for ${group}/${entry.name} [${getResetTag(entry.dimensions)}]`,
          );
        }
        return { ...entry, cost };
      }),
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
    console.log(`${group} [${getResetTag(dims)}] cost=${cost}`);
    return cost;
  });
  fs.writeFileSync(CONFIG_FILE, serialize(config));
  console.log(`Wrote ${CONFIG_FILE}`);
}

module.exports = { artifactPath, buildConfig, parseCircuitSize, serialize };

if (require.main === module) {
  main();
}
