import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { createConsoleLogger } from '../../log/console.js';
import { fileURLToPath } from '../../url/index.js';
import { isGenerateTestDataEnabled } from '../test_data.js';

/** Writes the contents specified to the target file if test data generation is enabled. */
export function writeTestData(targetFileFromRepoRoot: string, contents: string | Buffer, raw: boolean = false) {
  if (!isGenerateTestDataEnabled()) {
    return;
  }
  const targetFile = getPathToFile(targetFileFromRepoRoot);
  const toWrite = raw ? contents : typeof contents === 'string' ? contents : contents.toString('hex');
  writeFileSync(targetFile, toWrite);
  const logger = createConsoleLogger('aztec:testing:test_data');
  logger(`Wrote test data to ${targetFile}`);
}

export function readTestData(repoPath: string): Buffer {
  const targetFile = getPathToFile(repoPath);
  return readFileSync(targetFile);
}

/**
 * Looks for a variable assignment in the target file and updates the value, only if test data generation is enabled.
 * Note that a magic inline comment would be a cleaner approach, like `/* TEST-DATA-START *\/` and `/* TEST-DATA-END *\/`,
 * but running nargo fmt on it panics since the comment would be erased, so we roll with this for now.
 * @remarks Requires AZTEC_GENERATE_TEST_DATA=1 to be set
 */
export function updateInlineTestData(targetFileFromRepoRoot: string, itemName: string, value: string) {
  if (!isGenerateTestDataEnabled()) {
    return;
  }
  const logger = createConsoleLogger('aztec:testing:test_data');
  const targetFile = getPathToFile(targetFileFromRepoRoot);
  const contents = readFileSync(targetFile, 'utf8').toString();
  const regex = new RegExp(`(let|pub\\s+global)\\s+${itemName}(\\s*:\\s*[^=]+)?\\s*=\\s*([\\s\\S]*?);`, 'g');
  if (!regex.exec(contents)) {
    throw new Error(`Test data marker for ${itemName} not found in ${targetFile}`);
  }

  const updatedContents = contents.replace(
    regex,
    (_, declareKeyword, typeAnnotation) =>
      `${declareKeyword} ${itemName}${(typeAnnotation || '').trimEnd()} = ${value};`,
  );
  writeFileSync(targetFile, updatedContents);
  logger(`Updated test data in ${targetFile} for ${itemName} to ${value}`);
}

/**
 * Updates the sample Prover.toml files in noir-projects/noir-protocol-circuits/crates/.
 * @remarks Requires AZTEC_GENERATE_TEST_DATA=1 to be set
 * To re-gen, run 'AZTEC_GENERATE_TEST_DATA=1 FAKE_PROOFS=1 yarn test:e2e full.test'
 * To re-gen public base only, run 'AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test orchestrator_public_functions'
 */
export function updateProtocolCircuitSampleInputs(circuitName: string, value: string) {
  const logger = createConsoleLogger('aztec:testing:test_data');
  const targetFileFromRepoRoot = `noir-projects/noir-protocol-circuits/crates/${circuitName}/Prover.toml`;
  const targetFile = getPathToFile(targetFileFromRepoRoot);
  writeFileSync(targetFile, value);
  logger(`Updated test data in ${targetFile} for ${circuitName}`);
}

function getPathToFile(targetFileFromRepoRoot: string) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
  if (!existsSync(join(repoRoot, 'CODEOWNERS'))) {
    throw new Error(`Path to repo root is incorrect (got ${repoRoot})`);
  }

  return join(repoRoot, targetFileFromRepoRoot);
}
