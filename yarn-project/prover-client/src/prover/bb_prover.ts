/* eslint-disable require-await */
import { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  Proof,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  makeEmptyProof,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  BaseParityArtifact,
  BaseRollupArtifact,
  MergeRollupArtifact,
  ProtocolArtifacts,
  ProtocolCircuitArtifacts,
  RootParityArtifact,
  RootRollupArtifact,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBaseRollupInputsToWitnessMap,
  convertBaseRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { NativeACVMSimulator } from '@aztec/simulator';

import * as fs from 'fs/promises';

import {
  BB_RESULT,
  generateProof,
  generateProvingKeyForNoirCircuit,
  generateVerificationKeyForNoirCircuit,
} from '../bb/execute.js';
import { CircuitProver } from './interface.js';

const logger = createDebugLogger('aztec:bb-prover');

async function ensureAllKeys(bbBinaryPath: string, bbWorkingDirectory: string) {
  const realCircuits = Object.keys(ProtocolCircuitArtifacts).filter(
    (n: string) => !n.includes('Simulated') && !n.includes('PrivateKernel'),
  );
  const promises = [];
  for (const circuitName of realCircuits) {
    const provingKeyPromise = generateProvingKeyForNoirCircuit(
      bbBinaryPath,
      bbWorkingDirectory,
      circuitName,
      ProtocolCircuitArtifacts[circuitName as ProtocolArtifacts],
      logger,
    );
    const verificationKeyPromise = generateVerificationKeyForNoirCircuit(
      bbBinaryPath,
      bbWorkingDirectory,
      circuitName,
      ProtocolCircuitArtifacts[circuitName as ProtocolArtifacts],
      logger,
    );
    promises.push(...[provingKeyPromise, verificationKeyPromise]);
  }
  await Promise.all(promises);
}

export type BBProverConfig = {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  acvmBinaryPath: string;
  acvmWorkingDirectory: string;
};

/**
 * Prover implementation that uses barretenberg native proving
 */
export class BBNativeRollupProver implements CircuitProver {
  constructor(
    private simulator: NativeACVMSimulator,
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
  ) {}

  static async new(config: BBProverConfig) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using native BB at ${config.bbBinaryPath} and working directory ${config.bbWorkingDirectory}`);
    logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);

    await ensureAllKeys(config.bbBinaryPath, config.bbWorkingDirectory);

    const simulator = new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath, true);

    return new BBNativeRollupProver(simulator, config.bbBinaryPath, config.bbWorkingDirectory);
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getBaseParityProof(inputs: BaseParityInputs): Promise<[ParityPublicInputs, Proof]> {
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    const witness = await this.simulator.simulateCircuit(witnessMap, BaseParityArtifact);

    const result = convertBaseParityOutputsFromWitnessMap(witness);

    return Promise.resolve([result, makeEmptyProof()]);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getRootParityProof(inputs: RootParityInputs): Promise<[ParityPublicInputs, Proof]> {
    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    const witness = await this.simulator.simulateCircuit(witnessMap, RootParityArtifact);

    const result = convertRootParityOutputsFromWitnessMap(witness);

    return Promise.resolve([result, makeEmptyProof()]);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBaseRollupProof(input: BaseRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    const witnessMap = convertBaseRollupInputsToWitnessMap(input);

    const witness = await this.simulator.simulateCircuit(witnessMap, BaseRollupArtifact);

    const inputWitness = '';

    const provingResult = await generateProof(
      this.bbBinaryPath,
      this.bbWorkingDirectory,
      'Base Rollup',
      BaseRollupArtifact,
      inputWitness,
      logger,
    );

    if (provingResult.result.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate base rollup proof: ${provingResult.result.reason}`);
      throw new Error(provingResult.result.reason);
    }

    const result = convertBaseRollupOutputsFromWitnessMap(witness);

    return Promise.resolve([result, makeEmptyProof()]);
  }
  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getMergeRollupProof(input: MergeRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    const witnessMap = convertMergeRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.simulator.simulateCircuit(witnessMap, MergeRollupArtifact);

    const result = convertMergeRollupOutputsFromWitnessMap(witness);

    return Promise.resolve([result, makeEmptyProof()]);
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(input: RootRollupInputs): Promise<[RootRollupPublicInputs, Proof]> {
    const witnessMap = convertRootRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const [duration, witness] = await elapsed(() => this.simulator.simulateCircuit(witnessMap, RootRollupArtifact));

    const result = convertRootRollupOutputsFromWitnessMap(witness);

    logger(`Simulated root rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'root-rollup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return Promise.resolve([result, makeEmptyProof()]);
  }
}
