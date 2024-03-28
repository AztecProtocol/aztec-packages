/* eslint-disable require-await */
import {
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  PreviousRollupData,
  Proof,
  RollupTypes,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import {
  BaseRollupArtifact,
  ProtocolArtifacts,
  ProtocolCircuitArtifacts,
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

import { WitnessMap } from '@noir-lang/types';
import * as fs from 'fs/promises';

import { BB_RESULT, generateProof, generateVerificationKeyForNoirCircuit, verifyProof } from '../bb/execute.js';
import { CircuitProver } from './interface.js';

const logger = createDebugLogger('aztec:bb-prover');

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
  private provingKeyDirectories: Map<string, string> = new Map<string, string>();
  private verificationKeyDirectories: Map<string, string> = new Map<string, string>();
  constructor(private config: BBProverConfig) {}

  static async new(config: BBProverConfig) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using native BB at ${config.bbBinaryPath} and working directory ${config.bbWorkingDirectory}`);
    logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);

    const prover = new BBNativeRollupProver(config);
    await prover.init();
    return prover;
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getBaseParityProof(inputs: BaseParityInputs): Promise<[ParityPublicInputs, Proof]> {
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'BaseParityArtifact');

    const result = convertBaseParityOutputsFromWitnessMap(outputWitness);

    return Promise.resolve([result, proof]);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getRootParityProof(inputs: RootParityInputs): Promise<[ParityPublicInputs, Proof]> {
    // verify all base parity inputs
    await Promise.all(inputs.children.map(child => this.verifyProof('BaseParityInput', child.proof)));

    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'RootParityArtifact');

    const result = convertRootParityOutputsFromWitnessMap(outputWitness);

    return Promise.resolve([result, proof]);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBaseRollupProof(input: BaseRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    const witnessMap = convertBaseRollupInputsToWitnessMap(input);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'BaseRollupArtifact');

    const result = convertBaseRollupOutputsFromWitnessMap(outputWitness);

    return Promise.resolve([result, proof]);
  }
  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getMergeRollupProof(input: MergeRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    // verify both inputs
    await Promise.all(input.previousRollupData.map(prev => this.verifyPreviousRollupProof(prev)));

    const witnessMap = convertMergeRollupInputsToWitnessMap(input);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'MergeRollupArtifact');

    const result = convertMergeRollupOutputsFromWitnessMap(outputWitness);

    return Promise.resolve([result, proof]);
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(input: RootRollupInputs): Promise<[RootRollupPublicInputs, Proof]> {
    // verify the inputs
    await Promise.all(input.previousRollupData.map(prev => this.verifyPreviousRollupProof(prev)));

    const witnessMap = convertRootRollupInputsToWitnessMap(input);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'BaseRollupArtifact');

    await this.verifyProof('RootRollupArtifact', proof);

    const result = convertRootRollupOutputsFromWitnessMap(outputWitness);
    return Promise.resolve([result, proof]);
  }

  private async init() {
    const realCircuits = Object.keys(ProtocolCircuitArtifacts).filter(
      (n: string) => !n.includes('Simulated') && !n.includes('PrivateKernel'),
    );
    const promises = [];
    for (const circuitName of realCircuits) {
      const verificationKeyPromise = generateVerificationKeyForNoirCircuit(
        this.config.bbBinaryPath,
        this.config.bbWorkingDirectory,
        circuitName,
        ProtocolCircuitArtifacts[circuitName as ProtocolArtifacts],
        logger,
      ).then(result => {
        if (result) {
          this.verificationKeyDirectories.set(circuitName, result);
        }
      });
      promises.push(verificationKeyPromise);
    }
    await Promise.all(promises);
  }

  private async createProof(witnessMap: WitnessMap, circuitType: string): Promise<[WitnessMap, Proof]> {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });
    const outputWitnessFile = `${bbWorkingDirectory}/partial-witness.gz`;

    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = ProtocolCircuitArtifacts[circuitType as ProtocolArtifacts];

    logger(`Generating witness data for ${circuitType}`);

    const outputWitness = await simulator.simulateCircuit(witnessMap, artifact);

    logger(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      bbWorkingDirectory,
      circuitType,
      BaseRollupArtifact,
      outputWitnessFile,
      logger,
    );

    if (provingResult.result.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for ${circuitType}: ${provingResult.result.reason}`);
      throw new Error(provingResult.result.reason);
    }

    const proofBuffer = await fs.readFile(provingResult.outputPath);

    await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    logger(`Generated proof for ${circuitType}, size: ${proofBuffer.length} bytes`);

    return [outputWitness, Proof.fromBuffer(proofBuffer)];
  }

  private async verifyProof(circuitType: string, proof: Proof) {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    const proofFileName = `${bbWorkingDirectory}/proof`;
    const verificationKeyPath = this.verificationKeyDirectories.get(circuitType);

    await fs.writeFile(proofFileName, proof.toBuffer());

    const result = await verifyProof(this.config.bbBinaryPath, proofFileName, verificationKeyPath!, logger);

    await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    if (result.result.status === BB_RESULT.FAILURE) {
      throw new Error(`Failed to verify ${circuitType} proof!`);
    }

    logger(`Successfully verified ${circuitType} proof!`);
  }

  private async verifyPreviousRollupProof(previousRollupData: PreviousRollupData) {
    const proof = previousRollupData.proof;
    const circuitType =
      previousRollupData.baseOrMergeRollupPublicInputs.rollupType === RollupTypes.Base
        ? 'BaseRollupArtifact'
        : 'MergeRollupArtifact';
    await this.verifyProof(circuitType, proof);
  }
}
