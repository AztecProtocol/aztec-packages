import { compile } from '@noir-lang/noir_wasm';
import nodePath from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import noirResolver from '@noir-lang/noir-source-resolver';
import toml from 'toml';
import { NoirCompiledContract } from './noir_artifact.js';
import { ContractAbi, FunctionType } from '@aztec/foundation/abi';
import { mockVerificationKey } from './mockedKeys.js';

/**
 * A dependency entry of Nargo.toml.
 */
export interface Dependency {
  /**
   * Path to the dependency.
   */
  path?: string;
  /**
   * Git repository of the dependency.
   */
  git?: string;
}

export class ContractCompiler {
  constructor(private projectPath: string) {}

  public async compile(): Promise<ContractAbi[]> {
    const noirContracts = await this.compileNoir();
    const abis: ContractAbi[] = noirContracts.map(this.convertToAztecABI);
    return abis;
  }

  private convertToAztecABI(contract: NoirCompiledContract): ContractAbi {
    return {
      ...contract,
      functions: contract.functions.map(noirFn => ({
        name: noirFn.name,
        functionType: noirFn.function_type.toLowerCase() as FunctionType,
        parameters: noirFn.abi.parameters,
        returnTypes: [noirFn.abi.return_type],
        bytecode: Buffer.from(noirFn.bytecode).toString('hex'),
        verificationKey: mockVerificationKey,
      })),
    };
  }

  private async readDependencies(cratePath: string) {
    const { dependencies } = toml.parse(
      await fs.readFile(nodePath.join(cratePath, 'Nargo.toml'), { encoding: 'utf8' }),
    );
    return (dependencies || {}) as Record<string, Dependency>;
  }

  private async compileNoir(): Promise<NoirCompiledContract[]> {
    const dependenciesMap = await this.readDependencies(this.projectPath);

    noirResolver.initialiseResolver((id: string) => {
      const idParts = id.split('/');

      let path;
      if (dependenciesMap[idParts[0]]) {
        const [dependencyName, ...dependencySubpathParts] = idParts;
        const dependency = dependenciesMap[idParts[0]];
        if (!dependency.path) {
          throw new Error(`Don't know how to resolve dependency ${dependencyName}`);
        }
        path = nodePath.join(this.projectPath, dependency.path, 'src', dependencySubpathParts.join('/'));
      } else {
        path = nodePath.join(this.projectPath, 'src', idParts.join('/'));
      }

      // The resolver does not support async resolution
      // and holding the whole project in memory is not reasonable
      const result = fsSync.readFileSync(path, { encoding: 'utf8' });
      return result;
    });

    return compile({
      contracts: true,
      optional_dependencies_set: Object.keys(dependenciesMap), // eslint-disable-line camelcase
    });
  }
}
