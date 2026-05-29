// Reads compiled Noir artifacts for each standard contract and derives their addresses, class IDs,
// bytecode commitments, and initialization hashes — emitting everything as precomputed constants
// into `standard_contract_data.ts` and as Noir address stamps into the `standard_addresses.nr`
// modules of `aztec-nr/aztec` and `noir-contracts/.../aztec_sublib`. This avoids clients repeating
// the expensive hashing at runtime and keeps the Noir-side address aligned with the TS-side.
//
// Drift detection: every invocation renders the expected output in memory and compares against the
// existing on-disk content. Files that match are left untouched (no mtime churn). Files that
// differ are overwritten with the fresh content and the generator exits non-zero with a clear
// error — so the developer gets the regeneration for free, and a second `./bootstrap.sh` pass
// recompiles dependent Noir contracts against the now-correct values.
import { createConsoleLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import path from 'path';

import {
  type ContractData,
  NOIR_ARTIFACTS_SRC_PATH,
  STANDARD_ARTIFACTS_DEST_DIR,
  computeContractData,
  loadArtifact,
  standardContracts,
} from '../contract_data.js';
import { renderAllTargets, writeIfChanged } from '../drift.js';

const log = createConsoleLogger('autogenerate');

async function clearDestDir() {
  try {
    await fs.access(STANDARD_ARTIFACTS_DEST_DIR);
    // If the directory exists, remove it recursively.
    await fs.rm(STANDARD_ARTIFACTS_DEST_DIR, { recursive: true, force: true, maxRetries: 3 });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // If the directory does not exist, do nothing.
    } else {
      log(`Error removing dest directory: ${err}`);
    }
  }
  await fs.mkdir(STANDARD_ARTIFACTS_DEST_DIR, { recursive: true });
}

async function copyArtifact(srcName: string, destName: string) {
  const artifact = await loadArtifact(srcName);
  const src = path.join(NOIR_ARTIFACTS_SRC_PATH, `${srcName}.json`);
  const dest = path.join(STANDARD_ARTIFACTS_DEST_DIR, `${destName}.json`);
  await fs.copyFile(src, dest);
  return artifact;
}

async function generateDeclarationFile(destName: string) {
  const content = `
    import type { NoirCompiledContract } from '@aztec/stdlib/noir';
    const circuit: NoirCompiledContract;
    export = circuit;
  `;
  await fs.writeFile(path.join(STANDARD_ARTIFACTS_DEST_DIR, `${destName}.d.json.ts`), content);
}

/** The committed derived values for one contract, read back from the generated data module. */
type CommittedValues = {
  address: string;
  classId: string;
  artifactHash: string;
  privateFunctionsRoot: string;
  publicBytecodeCommitment: string;
  initializationHash: string;
  privateFunctionsCount: number;
};

/**
 * Reads the currently-committed derived values out of the generated `standard_contract_data.ts`
 * module so the drift report can show old → new. Returns `undefined` if the module doesn't exist
 * yet (first-ever generation).
 */
async function loadCommittedValues(): Promise<Record<string, CommittedValues> | undefined> {
  let mod: typeof import('../standard_contract_data.js');
  try {
    mod = await import('../standard_contract_data.js');
  } catch {
    return undefined;
  }
  const out: Record<string, CommittedValues> = {};
  for (const name of Object.keys(mod.StandardContractAddress) as (keyof typeof mod.StandardContractAddress)[]) {
    const preimage = mod.StandardContractClassIdPreimage[name];
    out[name] = {
      address: mod.StandardContractAddress[name].toString(),
      classId: mod.StandardContractClassId[name].toString(),
      artifactHash: preimage.artifactHash.toString(),
      privateFunctionsRoot: preimage.privateFunctionsRoot.toString(),
      publicBytecodeCommitment: preimage.publicBytecodeCommitment.toString(),
      initializationHash: mod.StandardContractInitializationHash[name].toString(),
      privateFunctionsCount: mod.StandardContractPrivateFunctions[name].length,
    };
  }
  return out;
}

/**
 * Lists which derived consts changed, comparing the freshly-derived values against the committed
 * snapshot — one indented line per changed field.
 */
function describeChanges(
  names: string[],
  derived: ContractData[],
  committed: Record<string, CommittedValues> | undefined,
): string {
  const lines: string[] = [];
  names.forEach((name, i) => {
    const d = derived[i];
    const prev = committed?.[name];
    if (!prev) {
      lines.push(`  ${name}: newly added (no prior committed values)`);
      return;
    }
    const cmp = (field: string, oldV: string, newV: string) => {
      if (oldV !== newV) {
        lines.push(`  ${name}.${field}: ${oldV} → ${newV}`);
      }
    };
    cmp('address', prev.address, d.address.toString());
    cmp('classId', prev.classId, d.classId.toString());
    cmp('artifactHash', prev.artifactHash, d.artifactHash.toString());
    cmp('privateFunctionsRoot', prev.privateFunctionsRoot, d.privateFunctionsRoot.toString());
    cmp('publicBytecodeCommitment', prev.publicBytecodeCommitment, d.publicBytecodeCommitment.toString());
    cmp('initializationHash', prev.initializationHash, d.initializationHash.toString());
    cmp('privateFunctions count', String(prev.privateFunctionsCount), String(d.privateFunctions.length));
  });
  // Possible if only the generated-file formatting changed (e.g. a codegen tweak) with no value delta.
  return lines.length > 0 ? lines.join('\n') : '  (no derived value changed — only generated-file formatting)';
}

async function main() {
  await clearDestDir();

  const names = standardContracts.map(c => c.name);
  const contractDataList: ContractData[] = [];
  for (const { name, src } of standardContracts) {
    const artifact = await copyArtifact(src, name);
    await generateDeclarationFile(name);
    contractDataList.push(await computeContractData(artifact));
  }

  // Snapshot the committed values before we overwrite the data file, so the drift report can show
  // exactly which consts changed (old → new) rather than a raw text diff.
  const committed = await loadCommittedValues();

  const targets = await renderAllTargets(names, contractDataList);
  const driftedFiles: string[] = [];
  for (const { path: filePath, content } of targets) {
    if (await writeIfChanged(filePath, content)) {
      driftedFiles.push(filePath);
    }
  }

  if (driftedFiles.length > 0) {
    const list = driftedFiles.map(f => `  - ${f}`).join('\n');
    throw new Error(
      `Standard contract addresses have changed. The following generated files were out of date and have been rewritten in-place with the freshly-derived values:\n${list}\n\n` +
        `Changed values (old → new):\n${describeChanges(names, contractDataList, committed)}\n\n` +
        `These are derived values — don't hand-edit them. Drift means an upstream change (a modified standard contract, its initialization parameters, or the bb/noir compiler) altered what they derive to.\n\n` +
        `Any noir-contract that imports the stale addresses (via aztec-nr or aztec_sublib) now has stale bytecode and must be rebuilt.\n\n` +
        `To recover, the simplest option is to re-run \`./bootstrap.sh\` from the repo root: the second pass picks up the now-correct values.\n\n` +
        `For a faster targeted recovery without rebuilding everything, run from the repo root:\n` +
        `  1. \`./bootstrap.sh build noir-contracts\`  (rebuilds contracts against the now-stamped addresses; equivalent to \`make noir-contracts\`)\n` +
        `  2. \`./bootstrap.sh build yarn-project\`    (the generator re-runs, sees no drift, and the build proceeds)\n\n` +
        `Commit the rewritten files alongside whatever source change triggered the drift.`,
    );
  }
}

try {
  await main();
} catch (err: unknown) {
  log(`Error generating standard contract data: ${err}`);
  process.exit(1);
}
