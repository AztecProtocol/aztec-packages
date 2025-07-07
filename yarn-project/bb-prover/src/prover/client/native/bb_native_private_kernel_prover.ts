import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import type { CircuitSimulator } from '@aztec/simulator/server';
import { type PrivateExecutionStep, serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import type { ClientIvcProof } from '@aztec/stdlib/proofs';

import { promises as fs } from 'fs';
import path from 'path';

import { BB_RESULT, computeGateCountForCircuit, executeBbClientIvcProof } from '../../../bb/execute.js';
import type { BBConfig } from '../../../config.js';
import { readClientIVCProofFromOutputDirectory } from '../../proof_utils.js';
import { BBPrivateKernelProver } from '../bb_private_kernel_prover.js';

/**
 * This proof creator implementation uses the native bb binary.
 */
export class BBNativePrivateKernelProver extends BBPrivateKernelProver {
  private constructor(
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
    private skipCleanup: boolean,
    protected override simulator: CircuitSimulator,
    protected override log = createLogger('bb-prover:native'),
  ) {
    super(new BundleArtifactProvider(), simulator, log);
  }

  public static async new(config: BBConfig, simulator: CircuitSimulator, log?: Logger) {
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    return new BBNativePrivateKernelProver(
      config.bbBinaryPath,
      config.bbWorkingDirectory,
      !!config.bbSkipCleanup,
      simulator,
      log,
    );
  }

  private async _createClientIvcProof(
    directory: string,
    executionSteps: PrivateExecutionStep[],
  ): Promise<ClientIvcProof> {
    const inputsPath = path.join(directory, 'ivc-inputs.msgpack');
    await fs.writeFile(inputsPath, serializePrivateExecutionSteps(executionSteps));
    const provingResult = await executeBbClientIvcProof(this.bbBinaryPath, directory, inputsPath, this.log.info);

    if (provingResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate client ivc proof`);
      throw new Error(provingResult.reason);
    }

    const proof = await readClientIVCProofFromOutputDirectory(directory);

    this.log.info(`Generated IVC proof`, {
      duration: provingResult.durationMs,
      eventName: 'circuit-proving',
    });

    return proof;
  }

  public override async createClientIvcProof(executionSteps: PrivateExecutionStep[]): Promise<ClientIvcProof> {
    this.log.info(`Generating Client IVC proof`);
    const operation = async (directory: string) => {
      return await this._createClientIvcProof(directory, executionSteps);
    };
    return await this.runInDirectory(operation);
  }

  public override async computeGateCountForCircuit(bytecode: Buffer, circuitName: string): Promise<number> {
    const logFunction = (message: string) => {
      this.log.debug(`$bb gates ${circuitName} - ${message}`);
    };

    const result = await computeGateCountForCircuit(
      this.bbBinaryPath,
      this.bbWorkingDirectory,
      circuitName,
      bytecode,
      'mega_honk',
      logFunction,
    );
    if (result.status === BB_RESULT.FAILURE) {
      throw new Error(result.reason);
    }

    return result.circuitSize as number;
  }

  private runInDirectory<T>(fn: (dir: string) => Promise<T>) {
    const log = this.log;
    return runInDirectory(
      this.bbWorkingDirectory,
      (dir: string) =>
        fn(dir).catch(err => {
          log.error(`Error running operation at ${dir}: ${err}`);
          throw err;
        }),
      this.skipCleanup,
      this.log,
    );
  }
}
