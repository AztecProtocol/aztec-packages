#!/usr/bin/env node
// Helpers for regenerate_genesis_constants.sh: validating a measured genesis and rewriting the pinned
// constants. Kept out of the shell script because both need real parsing — JSON in one case, a
// multi-line Noir declaration in the other — and both must fail loudly rather than silently no-op.
//
// Usage: genesis_constants.mjs parse <measurement.json>
//        genesis_constants.mjs write-constants <constants.nr> <nullifierRoot> <headerHash> <archiveRoot>

import { readFileSync, writeFileSync } from "node:fs";

function die(message) {
  console.error(`genesis_constants: ${message}`);
  process.exit(1);
}

function isField(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

// Reads the CLI's measurement and prints shell assignments for the caller to eval. Validates here so a
// malformed or non-monotonic measurement never reaches the files.
function parse(measurementPath) {
  let measurement;
  try {
    measurement = JSON.parse(readFileSync(measurementPath, "utf8")).canonical;
  } catch (err) {
    die(`could not read the measurement from ${measurementPath}: ${err.message}`);
  }
  if (!measurement) die("the measurement has no `canonical` section");

  const seeds = measurement.prefilledNullifiers ?? [];
  if (seeds.length === 0) die("no prefilled nullifiers were measured");
  for (const seed of seeds) {
    if (!isField(seed)) die(`prefilled nullifier is not a 32-byte hex value: ${seed}`);
  }
  // The indexed nullifier tree requires unique, strictly increasing prefilled leaves.
  for (let i = 1; i < seeds.length; i++) {
    if (BigInt(seeds[i]) <= BigInt(seeds[i - 1])) {
      die(`prefilled nullifiers are not strictly increasing at ${seeds[i]}`);
    }
  }
  for (const name of ["nullifierTreeRoot", "blockHeaderHash", "archiveRoot"]) {
    if (!isField(measurement[name])) die(`${name} is not a 32-byte hex value: ${measurement[name]}`);
  }

  console.log(`NULLIFIER_ROOT=${measurement.nullifierTreeRoot}`);
  console.log(`HEADER_HASH=${measurement.blockHeaderHash}`);
  console.log(`ARCHIVE_ROOT=${measurement.archiveRoot}`);
  console.log(`ARCHIVE_ROOT_DEC=${BigInt(measurement.archiveRoot).toString()}`);
  console.log(`SEEDS="${seeds.join(" ")}"`);
}

// Rewrites the `pub global <name>: Field = 0x...;` declarations, whose value the formatter may have
// wrapped onto the next line. Each name must match exactly once, so a renamed or duplicated constant
// fails instead of being skipped.
function writeConstants(path, values) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (err) {
    die(`could not read ${path}: ${err.message}`);
  }
  for (const [name, value] of Object.entries(values)) {
    if (!isField(value)) die(`refusing to write ${name}: ${value} is not a 32-byte hex value`);
    const declaration = new RegExp(`(pub global ${name}: Field =\\s*)0x[0-9a-fA-F]+;`, "g");
    const matches = source.match(declaration) ?? [];
    if (matches.length !== 1) {
      die(`expected exactly one declaration of ${name} in ${path}, found ${matches.length}`);
    }
    source = source.replace(declaration, `$1${value};`);
  }
  writeFileSync(path, source);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "parse":
    if (args.length !== 1) die("usage: genesis_constants.mjs parse <measurement.json>");
    parse(args[0]);
    break;
  case "write-constants":
    if (args.length !== 4) {
      die("usage: genesis_constants.mjs write-constants <constants.nr> <nullifierRoot> <headerHash> <archiveRoot>");
    }
    writeConstants(args[0], {
      GENESIS_NULLIFIER_TREE_ROOT: args[1],
      GENESIS_BLOCK_HEADER_HASH: args[2],
      GENESIS_ARCHIVE_ROOT: args[3],
    });
    break;
  default:
    die(`unknown command: ${command ?? "(none)"}`);
}
