import { ApiCompilerBase } from './api_compiler_base.js';

/**
 * Compiler for generating synchronous API implementation
 */
export class SyncApiCompiler extends ApiCompilerBase {
  constructor() {
    super('sync');
  }

  protected generateWasmImports(): string[] {
    return [`import { BarretenbergWasmMain } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";`];
  }

  protected generateApiClass(): string {
    const functions = this.functionMetadata.map(meta => {
      const commandType = meta.commandType;
      const responseType = meta.responseType;
      const methodName = commandType.charAt(0).toLowerCase() + commandType.slice(1);
      
      return `  ${methodName}(command: apiTypes.${commandType}): apiTypes.${responseType} {
    const msgpackCommand = apiTypes.from${commandType}(command);
    const [variantName, result] = this.wasm.msgpackCall('bbapi', ["${commandType}", msgpackCommand]);
    if (variantName !== '${responseType}') {
      throw new Error(\`Expected variant name '${responseType}' but got '\${variantName}'\`);
    }
    return apiTypes.to${responseType}(result);
  }`;
    });

    return `export class SyncApi {
  constructor(private wasm: BarretenbergWasmMain) {}

${functions.join('\n\n')}
}`;
  }
}