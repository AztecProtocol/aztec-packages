#!/usr/bin/env node
// Helpers for regenerate_genesis_constants.sh: measuring the canonical genesis, validating the measurement and
// writing the protocol-genesis package. Kept out of the shell script because they need real JSON handling and must
// fail loudly rather than silently no-op.
//
// Usage: genesis_constants.mjs measure <repo root> <constants.hpp> <protocol contract artifact>...
//        genesis_constants.mjs parse <measurement.json>
//        genesis_constants.mjs write-package <measurement.json> <package dir>

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

// Reads a measurement and validates it, so a malformed or non-monotonic one never reaches the files.
function readMeasurement(measurementPath) {
  let genesis;
  try {
    genesis = JSON.parse(readFileSync(measurementPath, "utf8"));
  } catch (err) {
    die(
      `could not read the measurement from ${measurementPath}: ${err.message}`,
    );
  }
  const { inputs, outputs } = genesis ?? {};
  if (!inputs || !outputs) die("the measurement needs `inputs` and `outputs`");

  const seeds = inputs.prefilledNullifiers ?? [];
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
    if (!isField(outputs[name]))
      die(`${name} is not a 32-byte hex value: ${outputs[name]}`);
  }
  return genesis;
}

// Prints shell assignments for the caller to eval.
function parse(measurementPath) {
  const { inputs, outputs } = readMeasurement(measurementPath);
  console.log(`NULLIFIER_ROOT=${outputs.nullifierTreeRoot}`);
  console.log(`HEADER_HASH=${outputs.blockHeaderHash}`);
  console.log(`ARCHIVE_ROOT=${outputs.archiveRoot}`);
  console.log(`SEEDS="${inputs.prefilledNullifiers.join(" ")}"`);
}

// Writes the package's genesis.json and index.js from a validated measurement. index.js carries the object inline
// rather than importing the JSON, so it loads in browsers and bundlers that do not take JSON modules.
function writePackage(measurementPath, outDir) {
  const json = JSON.stringify(readMeasurement(measurementPath), null, 2);
  writeFileSync(join(outDir, "genesis.json"), `${json}\n`);
  writeFileSync(
    join(outDir, "index.js"),
    "// GENERATED FILE - DO NOT EDIT.\n" +
      "// Regenerate with noir-projects/fnd/scripts/regenerate_genesis_constants.sh.\n" +
      `export const GENESIS = ${json};\n`,
  );
}

// Measures the canonical genesis: barretenberg derives the protocol contracts' registration nullifiers from their
// artifacts, and the reference world state, started from them, reports the roots. Prints the inputs and the outputs
// in the shape the protocol-genesis package carries them.
async function measure(repoRoot, constantsPath, artifactPaths) {
  const fromBbTs = createRequire(
    join(repoRoot, "barretenberg/ts/package.json"),
  );
  const { BbService } = await import(
    pathToFileURL(fromBbTs.resolve("@aztec-foundation/bb.js-api")).href
  );
  const { WsdbService } = await import(
    pathToFileURL(fromBbTs.resolve("@aztec-foundation/wsdb-ref")).href
  );

  const constantsHpp = readFileSync(constantsPath, "utf8");
  const constant = (name) => {
    const match = constantsHpp.match(new RegExp(`#define ${name} (\\d+)`));
    if (!match) die(`${name} not found in ${constantsPath}`);
    return Number(match[1]);
  };
  const toHex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;

  const bb = await BbService.wasm();
  let nullifiers;
  try {
    ({ nullifiers } = await bb.aztecProtocolGenesisNullifiers({
      artifacts: artifactPaths.map((path) => readFileSync(path)),
    }));
  } finally {
    await bb.destroy();
  }

  const inputs = {
    treeHeights: {
      nullifierTree: constant("NULLIFIER_TREE_HEIGHT"),
      noteHashTree: constant("NOTE_HASH_TREE_HEIGHT"),
      publicDataTree: constant("PUBLIC_DATA_TREE_HEIGHT"),
      l1ToL2MessageTree: constant("L1_TO_L2_MSG_TREE_HEIGHT"),
      archive: constant("ARCHIVE_HEIGHT"),
    },
    treePrefill: {
      nullifierTree: 2 * constant("MAX_NULLIFIERS_PER_TX"),
      publicDataTree:
        2 * constant("MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX"),
    },
    initialHeaderGeneratorPoint: constant("DOM_SEP__BLOCK_HEADER_HASH"),
    prefilledNullifiers: nullifiers.map(toHex),
    prefilledPublicData: [],
    genesisTimestamp: 0,
  };

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
        { treeId: NULLIFIER_TREE, height: inputs.treeHeights.nullifierTree },
        { treeId: NOTE_HASH_TREE, height: inputs.treeHeights.noteHashTree },
        { treeId: PUBLIC_DATA_TREE, height: inputs.treeHeights.publicDataTree },
        {
          treeId: L1_TO_L2_MESSAGE_TREE,
          height: inputs.treeHeights.l1ToL2MessageTree,
        },
        { treeId: ARCHIVE, height: inputs.treeHeights.archive },
      ],
      treePrefill: [
        { treeId: NULLIFIER_TREE, size: inputs.treePrefill.nullifierTree },
        { treeId: PUBLIC_DATA_TREE, size: inputs.treePrefill.publicDataTree },
      ],
      prefilledPublicData: [],
      prefilledNullifiers: nullifiers,
      genesisTimestamp: inputs.genesisTimestamp,
      initialHeaderGeneratorPoint: inputs.initialHeaderGeneratorPoint,
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
        inputs,
        outputs: {
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
    if (args.length < 3)
      die("usage: genesis_constants.mjs measure <repo root> <constants.hpp> <protocol contract artifact>...");
    await measure(args[0], args[1], args.slice(2));
    break;
  case "parse":
    if (args.length !== 1)
      die("usage: genesis_constants.mjs parse <measurement.json>");
    parse(args[0]);
    break;
  case "write-package":
    if (args.length !== 2)
      die(
        "usage: genesis_constants.mjs write-package <measurement.json> <package dir>",
      );
    writePackage(args[0], args[1]);
    break;
  default:
    die(`unknown command: ${command ?? "(none)"}`);
}
