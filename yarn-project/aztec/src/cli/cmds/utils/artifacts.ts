import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

export interface CompiledArtifact {
  noir_version: string;
  file_map: unknown;
  functions: ContractFunction[];
  bytecode?: string;
  /**
   * Set to true by the AVM transpiler (invoked via `bb aztec_process`) once the contract has been transpiled and its
   * verification keys generated. Absent on raw `nargo compile` output, hence optional.
   */
  transpiled?: boolean;
}

export interface ContractFunction {
  name: string;
  abi: unknown;
  bytecode: string;
  debug_symbols: unknown;
  is_unconstrained?: boolean;
}

export interface ArtifactFile {
  name: string;
  filePath: string;
  content: CompiledArtifact;
}

/** Reads all JSON artifact files from a target directory and returns their parsed contents. */
export async function readArtifactFiles(targetDir: string): Promise<ArtifactFile[]> {
  let entries: string[];
  try {
    entries = (await readdir(targetDir)).filter(f => f.endsWith('.json'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`Target directory '${targetDir}' does not exist. Compile first with 'aztec compile'.`);
    }
    throw err;
  }

  const artifacts: ArtifactFile[] = [];
  for (const file of entries) {
    const filePath = join(targetDir, file);
    const content = JSON.parse(await readFile(filePath, 'utf-8')) as CompiledArtifact;
    artifacts.push({ name: file.replace('.json', ''), filePath, content });
  }
  return artifacts;
}
