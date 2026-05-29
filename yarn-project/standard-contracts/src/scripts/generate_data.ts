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
import { renderAllTargets, renderDriftDiff, writeIfChanged } from '../drift.js';

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

async function main() {
  await clearDestDir();

  const names = standardContracts.map(c => c.name);
  const contractDataList: ContractData[] = [];
  for (const { name, src } of standardContracts) {
    const artifact = await copyArtifact(src, name);
    await generateDeclarationFile(name);
    contractDataList.push(await computeContractData(artifact));
  }

  const targets = await renderAllTargets(names, contractDataList);
  const driftedFiles: { path: string; diff: string }[] = [];
  for (const { path: filePath, content } of targets) {
    const { changed, previous } = await writeIfChanged(filePath, content);
    if (changed) {
      driftedFiles.push({ path: filePath, diff: renderDriftDiff(filePath, previous, content) });
    }
  }

  if (driftedFiles.length > 0) {
    const list = driftedFiles.map(f => `  - ${f.path}`).join('\n');
    const diffs = driftedFiles.map(f => f.diff).join('\n\n');
    throw new Error(
      `Standard contract addresses have changed. The following generated files were out of date and have been rewritten in-place with the freshly-derived values:\n${list}\n\n` +
        `What changed (− actual / committed, + expected / freshly derived):\n\n${diffs}\n\n` +
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
