import { ApiCompilerBase } from './api_compiler_base.js';

/**
 * Compiler for generating asynchronous API implementation
 */
export class AsyncApiCompiler extends ApiCompilerBase {
  constructor() {
    super('async');
  }

  protected generateWasmImports(): string[] {
    return [`import { BarretenbergWasmMainWorker } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";`];
  }

  protected generateApiClass(): string {
    const functions = this.functionMetadata.map(meta => {
      const commandType = meta.commandType;
      const responseType = meta.responseType;
      const methodName = commandType.charAt(0).toLowerCase() + commandType.slice(1);

      return `  async ${methodName}(command: apiTypes.${commandType}): Promise<apiTypes.${responseType}> {
    const msgpackCommand = apiTypes.from${commandType}(command);
    const [variantName, result] = await this.wasm.msgpackCall('bbapi', ["${commandType}", msgpackCommand]);
    if (variantName !== '${responseType}') {
      throw new Error(\`Expected variant name '${responseType}' but got '\${variantName}'\`);
    }
    return apiTypes.to${responseType}(result);
  }`;
    });

    return `export class AsyncApi {
  constructor(private wasm: BarretenbergWasmMainWorker) {}

${functions.join('\n\n')}
}`;
  }
}
