import { type ClientIvcProof } from '@aztec/circuits.js';
import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import { SimulationProvider } from '@aztec/simulator/server';

import { encode } from '@msgpack/msgpack';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import { promises as fs } from 'fs';
import path from 'path';

import { BB_RESULT, computeGateCountForCircuit, executeBbClientIvcProof } from '../bb/execute.js';
import { type BBConfig } from '../config.js';
import { BBPrivateKernelProver } from './bb_private_kernel_prover.js';
import { readFromOutputDirectory } from './client_ivc_proof_utils.js';

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

  private async _createClientIvcProof(
    directory: string,
    acirs: Buffer[],
    witnessStack: WitnessMap[],
  ): Promise<ClientIvcProof> {
    // TODO(#7371): Longer term we won't use this hacked together msgpack format
    // and instead properly create the bincode serialization from rust
    await fs.writeFile(path.join(directory, 'acir.msgpack'), encode(acirs));
    await fs.writeFile(
      path.join(directory, 'witnesses.msgpack'),
      encode(witnessStack.map(map => serializeWitness(map))),
    );
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

    const proof = await readFromOutputDirectory(directory);

    this.log.info(`Generated IVC proof`, {
      duration: provingResult.durationMs,
      eventName: 'circuit-proving',
    });

    return proof;
  }

  public override async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    this.log.info(`Generating Client IVC proof`);
    const operation = async (directory: string) => {
      return await this._createClientIvcProof(directory, acirs, witnessStack);
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
    );
  }
}
