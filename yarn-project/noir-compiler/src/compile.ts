import { compile } from '@noir-lang/noir_wasm';
import nodePath from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import noirResolver from '@noir-lang/noir-source-resolver';
import toml from 'toml';
import { Dependency } from './compiled_circuit.js';

export class ContractCompiler {
  constructor(private projectPath: string) {}

  public async compile() {
    console.log(await this.compileNoir());
  }

  private async readDependencies(cratePath: string) {
    const { dependencies } = toml.parse(
      await fs.readFile(nodePath.join(cratePath, 'Nargo.toml'), { encoding: 'utf8' }),
    );
    return (dependencies || {}) as Record<string, Dependency>;
  }

  private async compileNoir() {
    const dependenciesMap = await this.readDependencies(this.projectPath);
    console.log('Dependencies', dependenciesMap);

    noirResolver.initialiseResolver((id: string) => {
      console.log('Resolver request', id);
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

      console.log('Resolved path', path);

      // AFAIK the resolver does not support async resolution
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
