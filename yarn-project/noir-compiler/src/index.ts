import { ContractArtifact } from '@aztec/foundation/abi';

import { join } from 'path';

import { OnDiskFileManager } from './compile/noir/file-manager/on-disk-file-manager.js';
import { NoirWasmCompileOptions, NoirWasmContractCompiler } from './compile/noir/noir-wasm-compiler.js';
import { generateContractArtifact } from './contract-interface-gen/abi.js';

export { NoirVersion } from './noir-version.js';

export { generateNoirContractInterface } from './contract-interface-gen/noir.js';
export { generateTypescriptContractInterface } from './contract-interface-gen/typescript.js';
export { generateContractArtifact };

/**
 * Compile Aztec.nr contracts in project path using a nargo binary available in the shell.
 * @param projectPath - Path to project.
 * @returns Compiled artifacts.
 */
export async function compileUsingNoirWasm(
  projectPath: string,
  opts: NoirWasmCompileOptions,
): Promise<ContractArtifact[]> {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? '', '.cache');
  const fileManager = new OnDiskFileManager(join(cacheRoot, 'aztec-noir-compiler'));

  return (await NoirWasmContractCompiler.new(fileManager, projectPath, opts).compile()).map(generateContractArtifact);
}
