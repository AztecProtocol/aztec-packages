import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { CompiledArtifact, ContractFunction } from './utils/artifacts.js';
import { readArtifactFiles } from './utils/artifacts.js';

export const MAX_CONCURRENT = 4;

export interface DiscoveredArtifact {
  name: string;
  filePath: string;
  type: 'contract-function' | 'program';
}

/**
 * Reads a target directory and returns a list of discovered artifacts with temp files
 * created for contract functions. Caller must clean up tmpDir when done.
 */
export async function discoverArtifacts(
  targetDir: string,
): Promise<{ artifacts: DiscoveredArtifact[]; tmpDir: string }> {
  const files = await readArtifactFiles(targetDir);
  const tmpDir = await mkdtemp(join(tmpdir(), 'aztec-profile-'));
  const artifacts: DiscoveredArtifact[] = [];

  for (const file of files) {
    if (Array.isArray(file.content.functions)) {
      for (const func of file.content.functions) {
        if (!func.bytecode || func.is_unconstrained) {
          continue;
        }
        const name = `${file.name}::${func.name}`;
        const tmpPath = join(tmpDir, `${file.name}-${func.name}.json`);
        await writeFile(tmpPath, makeFunctionArtifact(file.content, func));
        artifacts.push({ name, filePath: tmpPath, type: 'contract-function' });
      }
    } else if (file.content.bytecode) {
      artifacts.push({ name: file.name, filePath: file.filePath, type: 'program' });
    }
  }

  return { artifacts, tmpDir };
}

/** Extracts a contract function as a standalone program artifact JSON string. */
export function makeFunctionArtifact(artifact: CompiledArtifact, func: ContractFunction) {
  /* eslint-disable camelcase */
  return JSON.stringify({
    noir_version: artifact.noir_version,
    hash: 0,
    abi: func.abi,
    bytecode: func.bytecode,
    debug_symbols: func.debug_symbols,
    file_map: artifact.file_map,
  });
  /* eslint-enable camelcase */
}
