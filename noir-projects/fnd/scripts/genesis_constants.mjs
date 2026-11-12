#!/usr/bin/env node
// Helpers for regenerate_genesis_constants.sh: measuring the canonical genesis, validating the measurement and
// rewriting the pinned constants. Kept out of the shell script because both need real parsing — JSON in one case, a
// multi-line Noir declaration in the other — and both must fail loudly rather than silently no-op.
//
// Usage: genesis_constants.mjs measure <repo root> <protocol contract artifact>...
//        genesis_constants.mjs parse <measurement.json>
//        genesis_constants.mjs write-constants <constants.nr> <nullifierRoot> <headerHash> <archiveRoot>

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
    die(
      `could not read the measurement from ${measurementPath}: ${err.message}`,
    );
  }
  if (!measurement) die("the measurement has no `canonical` section");

  const seeds = measurement.prefilledNullifiers ?? [];
  if (seeds.length === 0) die("no prefilled nullifiers were measured");
  for (const seed of seeds) {
    if (!isField(seed))
      die(`prefilled nullifier is not a 32-byte hex value: ${seed}`);
  }
  // The indexed nullifier tree requires unique, strictly increasing prefilled leaves.
  for (let i = 1; i < seeds.length; i++) {
    if (BigInt(seeds[i]) <= BigInt(seeds[i - 1])) {
      die(`prefilled nullifiers are not strictly increasing at ${seeds[i]}`);
    }
  }
  for (const name of ["nullifierTreeRoot", "blockHeaderHash", "archiveRoot"]) {
    if (!isField(measurement[name]))
      die(`${name} is not a 32-byte hex value: ${measurement[name]}`);
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
    if (!isField(value))
      die(`refusing to write ${name}: ${value} is not a 32-byte hex value`);
    const declaration = new RegExp(
      `(pub global ${name}: Field =\\s*)0x[0-9a-fA-F]+;`,
      "g",
    );
    const matches = source.match(declaration) ?? [];
    if (matches.length !== 1) {
      die(
        `expected exactly one declaration of ${name} in ${path}, found ${matches.length}`,
      );
    }
    source = source.replace(declaration, `$1${value};`);
  }
  writeFileSync(path, source);
}

// Measures the canonical genesis: barretenberg derives the protocol contracts' registration nullifiers from their
// artifacts, and the reference world state, started from them, reports the roots. Prints the measurement as `parse`
// reads it.
async function measure(repoRoot, artifactPaths) {
  const fromBbTs = createRequire(
    join(repoRoot, "barretenberg/ts/package.json"),
  );
  const { BbService } = await import(
    pathToFileURL(fromBbTs.resolve("@aztec-foundation/bb.js-api")).href
  );
  const { WsdbService } = await import(
    pathToFileURL(fromBbTs.resolve("@aztec-foundation/wsdb-ref")).href
  );

  const constantsHpp = readFileSync(
    join(
      repoRoot,
      "barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp",
    ),
    "utf8",
  );
  const constant = (name) => {
    const match = constantsHpp.match(new RegExp(`#define ${name} (\\d+)`));
    if (!match) die(`${name} not found in aztec_constants.hpp`);
    return Number(match[1]);
  };
  const toHex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;

  const bb = await BbService.wasm();
  let prefilledNullifiers;
  try {
    ({ nullifiers: prefilledNullifiers } =
      await bb.aztecProtocolGenesisNullifiers({
        artifacts: artifactPaths.map((path) => readFileSync(path)),
      }));
  } finally {
    await bb.destroy();
  }

  const [
    NULLIFIER_TREE,
    NOTE_HASH_TREE,
    PUBLIC_DATA_TREE,
    L1_TO_L2_MESSAGE_TREE,
    ARCHIVE,
  ] = [0, 1, 2, 3, 4];
  const ws = await WsdbService.wasm();
  try {
    await ws.init({
      treeHeights: [
        { treeId: NULLIFIER_TREE, height: constant("NULLIFIER_TREE_HEIGHT") },
        { treeId: NOTE_HASH_TREE, height: constant("NOTE_HASH_TREE_HEIGHT") },
        {
          treeId: PUBLIC_DATA_TREE,
          height: constant("PUBLIC_DATA_TREE_HEIGHT"),
        },
        {
          treeId: L1_TO_L2_MESSAGE_TREE,
          height: constant("L1_TO_L2_MSG_TREE_HEIGHT"),
        },
        { treeId: ARCHIVE, height: constant("ARCHIVE_HEIGHT") },
      ],
      treePrefill: [
        { treeId: NULLIFIER_TREE, size: 2 * constant("MAX_NULLIFIERS_PER_TX") },
        {
          treeId: PUBLIC_DATA_TREE,
          size: 2 * constant("MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX"),
        },
      ],
      prefilledPublicData: [],
      prefilledNullifiers,
      genesisTimestamp: 0,
      initialHeaderGeneratorPoint: constant("DOM_SEP__BLOCK_HEADER_HASH"),
    });
    const committed = {
      forkId: 0,
      blockNumber: 0xffffffff,
      includeUncommitted: false,
    };
    const nullifierTree = await ws.getTreeInfo({
      treeId: NULLIFIER_TREE,
      revision: committed,
    });
    const archive = await ws.getTreeInfo({
      treeId: ARCHIVE,
      revision: committed,
    });
    const header = await ws.getLeafValue({
      treeId: ARCHIVE,
      revision: committed,
      leafIndex: 0,
    });
    if (!header.value) die("the genesis block header is not in the archive");
    console.log(
      JSON.stringify({
        canonical: {
          prefilledNullifiers: prefilledNullifiers.map(toHex),
          nullifierTreeRoot: toHex(nullifierTree.root),
          blockHeaderHash: toHex(header.value),
          archiveRoot: toHex(archive.root),
        },
      }),
    );
  } finally {
    await ws.destroy();
  }
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "measure":
    if (args.length < 2)
      die(
        "usage: genesis_constants.mjs measure <repo root> <protocol contract artifact>...",
      );
    await measure(args[0], args.slice(1));
    break;
  case "parse":
    if (args.length !== 1)
      die("usage: genesis_constants.mjs parse <measurement.json>");
    parse(args[0]);
    break;
  case "write-constants":
    if (args.length !== 4) {
      die(
        "usage: genesis_constants.mjs write-constants <constants.nr> <nullifierRoot> <headerHash> <archiveRoot>",
      );
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
