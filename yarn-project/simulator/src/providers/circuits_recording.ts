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

interface CircuitRecording {
  contractName: string;
  functionName: string;
  bytecodeHash: string;
  timestamp: number;
  inputs: Record<string, unknown>;
  oracleCalls: {
    name: string;
    inputs: unknown[];
    outputs: unknown;
  }[];
}

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
    await fs.mkdir(recordDir, { recursive: true });

    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0];
    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filename = `${formattedDate}_${formattedTime}_${artifact.contractName}_${artifact.name}.json`;
    const filePath = path.join(recordDir, filename);

    const recorder = new CircuitRecorder(callback, filePath);

    const bytecodeHash = createHash('md5').update(artifact.bytecode).digest('hex');
    const recording: CircuitRecording = {
      contractName: artifact.contractName,
      functionName: artifact.name,
      bytecodeHash,
      timestamp: date.getTime(),
      inputs: Object.fromEntries(input),
      oracleCalls: [],
    };

    await fs.writeFile(recorder.filePath, JSON.stringify(recording, null, 2).slice(0, -2) + ',\n  "oracleCalls": [\n');
    return recorder;
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
