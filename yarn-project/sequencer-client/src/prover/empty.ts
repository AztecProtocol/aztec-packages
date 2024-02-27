/* eslint-disable require-await */
import {
  AggregationObject,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  Fr,
  MergeRollupInputs,
  Proof,
  PublicCircuitPublicInputs,
  PublicKernelCircuitPublicInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { spawn } from 'child_process';
import fs from 'fs/promises';

import { AvmProver, PublicProver, RollupProver } from './index.js';

const EMPTY_PROOF_SIZE = 42;

// TODO: Silently modifying one of the inputs to inject the aggregation object is horrible.
// We should rethink these interfaces.

/**
 * Prover implementation that returns empty proofs and overrides aggregation objects.
 */
export class EmptyRollupProver implements RollupProver {
  /**
   * Creates an empty proof for the given input.
   * @param _input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  async getBaseRollupProof(_input: BaseRollupInputs, publicInputs: BaseOrMergeRollupPublicInputs): Promise<Proof> {
    publicInputs.aggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }

  /**
   * Creates an empty proof for the given input.
   * @param _input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  async getMergeRollupProof(_input: MergeRollupInputs, publicInputs: BaseOrMergeRollupPublicInputs): Promise<Proof> {
    publicInputs.aggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
  /**
   * Creates an empty proof for the given input.
   * @param _input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  async getRootRollupProof(_input: RootRollupInputs, publicInputs: RootRollupPublicInputs): Promise<Proof> {
    publicInputs.aggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
}

/**
 * Prover implementation that returns empty proofs.
 */
export class EmptyPublicProver implements PublicProver {
  /**
   * Creates an empty proof for the given input.
   * @param _publicInputs - Public inputs obtained via simulation.
   */
  async getPublicCircuitProof(_publicInputs: PublicCircuitPublicInputs): Promise<Proof> {
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }

  /**
   * Creates an empty proof for the given input.
   * @param _publicInputs - Public inputs obtained via simulation.
   */
  async getPublicKernelCircuitProof(_publicInputs: PublicKernelCircuitPublicInputs): Promise<Proof> {
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
}

export class CliAvmProver implements AvmProver {
  private binaryPath = '/mnt/user-data/ilyas/Code/aztec-packages/barretenberg/cpp/build/bin';
  private inputsPath = '/tmp';
  private targetPath = '/tmp';
  async getAvmProof(calldata: Fr[], bytecode: Buffer): Promise<Buffer> {
    const logger = createDebugLogger('avm-prover-cpp');
    logger.debug(`Bytecode: ${bytecode}`);
    try {
      await fs.writeFile(
        `${this.inputsPath}/calldata.bin`,
        calldata.map(c => c.toBuffer()),
      );
      await fs.writeFile(`${this.inputsPath}/avm_bytecode.bin`, bytecode);
    } catch (err: any) {
      logger.debug('error', err);
    }

    const bbBinary = spawn(`${this.binaryPath}/bb`, [
      '-b',
      `${this.inputsPath}/avm_bytecode.bin`,
      '-d',
      `${this.inputsPath}/calldata.bin`,
      'o',
      `${this.targetPath}/proof`,
    ]);
    return new Promise(resolve => {
      bbBinary.on('close', async () => {
        logger.debug('Completed process');
        resolve(fs.readFile(`${this.targetPath}/proof`));
      });
    });
  }
}
