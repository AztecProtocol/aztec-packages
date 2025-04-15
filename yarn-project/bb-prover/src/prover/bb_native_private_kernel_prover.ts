import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { serializeWitness } from '@aztec/noir-noirc_abi';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import type { SimulationProvider } from '@aztec/simulator/server';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import type { ClientIvcProof } from '@aztec/stdlib/proofs';

import { encode } from '@msgpack/msgpack';
import { promises as fs } from 'fs';
import path from 'path';

import { BB_RESULT, computeGateCountForCircuit, executeBbClientIvcProof } from '../bb/execute.js';
import type { BBConfig } from '../config.js';
import { BBPrivateKernelProver } from './bb_private_kernel_prover.js';
import { readClientIVCProofFromOutputDirectory } from './proof_utils.js';

/**
 * This proof creator implementation uses the native bb binary.
 */
export class BBNativePrivateKernelProver extends BBPrivateKernelProver {
  private constructor(
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
    private skipCleanup: boolean,
    protected override simulationProvider: SimulationProvider,
    protected override log = createLogger('bb-prover:native'),
  ) {
    super(new BundleArtifactProvider(), simulationProvider, log);
  }

  public static async new(config: BBConfig, simulationProvider: SimulationProvider, log?: Logger) {
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    return new BBNativePrivateKernelProver(
      config.bbBinaryPath,
      config.bbWorkingDirectory,
      !!config.bbSkipCleanup,
      simulationProvider,
      log,
    );
  }

  // TODO(#7371): This is duplicated.
  // Longer term we won't use this hacked together msgpack format
  // Leaving duplicated as this eventually bb will provide a serialization
  // helper for passing to a generic msgpack RPC endpoint.
  private async _createClientIvcProofFiles(directory: string, executionSteps: PrivateExecutionStep[]) {
    const acirPath = path.join(directory, 'acir.msgpack');
    const witnessPath = path.join(directory, 'witnesses.msgpack');
    await fs.writeFile(acirPath, encode(executionSteps.map(map => map.bytecode)));
    await fs.writeFile(witnessPath, encode(executionSteps.map(map => serializeWitness(map.witness))));
    return {
      acirPath,
      witnessPath,
    };
  }

  private async _createClientIvcProof(
    directory: string,
    executionSteps: PrivateExecutionStep[],
  ): Promise<ClientIvcProof> {
    await this._createClientIvcProofFiles(directory, executionSteps);
    const provingResult = await executeBbClientIvcProof(
      this.bbBinaryPath,
      directory,
      path.join(directory, 'acir.msgpack'),
      path.join(directory, 'witnesses.msgpack'),
      this.log.info,
    );

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
