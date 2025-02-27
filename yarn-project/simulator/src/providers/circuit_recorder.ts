import { createLogger } from '@aztec/foundation/log';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';

import type { ForeignCallInput } from '@noir-lang/acvm_js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
// TODO(benesjan): What about browser?
import path from 'path';

import type { ACIRCallback } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';
import { Oracle } from '../acvm/oracle/oracle.js';

export class CircuitRecorder {
  private readonly logger = createLogger('simulator:acvm:recording');
  private isFirstCall = true;

  private constructor(private readonly callback: ACIRCallback, private readonly filePath: string) {}

  static async start(
    input: ACVMWitness,
    callback: ACIRCallback,
    artifact: FunctionArtifactWithContractName,
    recordDir: string,
  ): Promise<CircuitRecorder> {
    const recording = {
      contractName: artifact.contractName,
      functionName: artifact.name,
      bytecodeMd5Hash: createHash('md5').update(artifact.bytecode).digest('hex'),
      timestamp: Date.now(),
      inputs: Object.fromEntries(input),
    };

    const recordingStringWithoutClosingBracket = JSON.stringify(recording, null, 2).slice(0, -2);

    await fs.mkdir(recordDir, { recursive: true });

    let counter = 0;
    let filePath: string;
    while (true) {
      try {
        filePath = getFilePath(artifact, recordDir, counter);
        await fs.writeFile(filePath, recordingStringWithoutClosingBracket + ',\n  "oracleCalls": [\n', {
          flag: 'wx', // wx flag fails if file exists
        });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          counter++;
          continue;
        }
        throw err;
      }
    }

    return new CircuitRecorder(callback, filePath!);
  }

  getCallback(): ACIRCallback {
    const recordingCallback: ACIRCallback = {} as ACIRCallback;
    const oracleMethods = Object.getOwnPropertyNames(Oracle.prototype).filter(name => name !== 'constructor');

    for (const name of oracleMethods) {
      const fn = this.callback[name as keyof ACIRCallback];
      if (!fn) {
        throw new Error(`Oracle method ${name} not found when setting up recording callback`);
      }

      recordingCallback[name as keyof ACIRCallback] = (...args: ForeignCallInput[]): ReturnType<typeof fn> => {
        const result = fn.call(this.callback, ...args);
        if (result instanceof Promise) {
          return result.then(async r => {
            await this.#recordCall(name, args, r);
            return r;
          }) as ReturnType<typeof fn>;
        }
        void this.#recordCall(name, args, result);
        return result;
      };
    }

    return recordingCallback;
  }

  async #recordCall(name: string, inputs: unknown[], outputs: unknown) {
    try {
      const entry = {
        name,
        inputs,
        outputs,
      };
      const prefix = this.isFirstCall ? '    ' : '    ,';
      this.isFirstCall = false;
      await fs.appendFile(this.filePath, prefix + JSON.stringify(entry) + '\n');
    } catch (err) {
      this.logger.error('Failed to log circuit call', { error: err });
    }
  }

  async finish(): Promise<void> {
    try {
      await fs.appendFile(this.filePath, '  ]\n}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file', { error: err });
    }
  }
}

function getFilePath(artifact: FunctionArtifactWithContractName, recordDir: string, counter: number): string {
  const date = new Date();
  const formattedDate = date.toISOString().split('T')[0];
  const filename = `${artifact.contractName}_${artifact.name}_${formattedDate}_${counter}.json`;
  return path.join(recordDir, filename);
}
