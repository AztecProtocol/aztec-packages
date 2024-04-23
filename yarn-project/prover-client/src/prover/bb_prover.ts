/* eslint-disable require-await */
import { type PublicKernelNonTailRequest, type PublicKernelTailRequest, PublicKernelType } from '@aztec/circuit-types';
import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  Fr,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS,
  type PreviousRollupData,
  Proof,
  type PublicKernelCircuitPublicInputs,
  type RECURSIVE_PROOF_LENGTH_IN_FIELDS,
  RecursiveProof,
  RollupTypes,
  RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  VerificationKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import {
  ServerCircuitArtifacts,
  type ServerProtocolArtifact,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBaseRollupInputsToWitnessMap,
  convertBaseRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertPublicTailInputsToWitnessMap,
  convertPublicTailOutputFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { NativeACVMSimulator } from '@aztec/simulator';

import { type WitnessMap } from '@noir-lang/types';
import * as fs from 'fs/promises';

import { BB_RESULT, generateKeyForNoirCircuit, generateProof, verifyProof } from '../bb/execute.js';
import { type CircuitProver, KernelArtifactMapping } from './interface.js';

const logger = createDebugLogger('aztec:bb-prover');

const vkFileName = 'vk';
const vkFieldsFileName = 'vk_fields.json';
const proofFileName = 'proof';
const proofFieldsFileName = 'proof_fields.json';

export type BBProverConfig = {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  acvmBinaryPath: string;
  acvmWorkingDirectory: string;
  // list of circuits supported by this prover. defaults to all circuits if empty
  circuitFilter?: ServerProtocolArtifact[];
};

const VK_KEY_SIZE_IN_FIELDS = 114;

type VerificationKeyData = {
  hash: Fr;
  keyAsFields: Tuple<Fr, typeof VK_KEY_SIZE_IN_FIELDS>;
  keyAsBytes: Buffer;
  numPublicInputs: number;
};

/**
 * Prover implementation that uses barretenberg native proving
 */
export class BBNativeRollupProver implements CircuitProver {
  private verificationKeys: Map<ServerProtocolArtifact, Promise<VerificationKeyData>> = new Map<
    ServerProtocolArtifact,
    Promise<VerificationKeyData>
  >();
  constructor(private config: BBProverConfig) {}

  static async new(config: BBProverConfig) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using native BB at ${config.bbBinaryPath} and working directory ${config.bbWorkingDirectory}`);
    logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);

    //const mappings = await generateAllServerVks(config.bbBinaryPath, config.bbWorkingDirectory, logger.info);

    return new BBNativeRollupProver(config);
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getBaseParityProof(
    inputs: BaseParityInputs,
  ): Promise<RootParityInput<typeof RECURSIVE_PROOF_LENGTH_IN_FIELDS>> {
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    const [outputWitness, proof] = await this.createRecursiveProof<typeof RECURSIVE_PROOF_LENGTH_IN_FIELDS>(
      witnessMap,
      'BaseParityArtifact',
    );

    const result = convertBaseParityOutputsFromWitnessMap(outputWitness);

    const verificationKey = await this.getVerificationKeyDataForCircuit('BaseParityArtifact');

    const vk = new VerificationKey(verificationKey.keyAsFields, verificationKey.hash);

    logger.debug(`Public inputs sha root: ${result.shaRoot.toString()}`);
    logger.debug(`Public inputs converted root: ${result.convertedRoot.toString()}`);

    return Promise.resolve(new RootParityInput(proof, vk, result));
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getRootParityProof(
    inputs: RootParityInputs,
  ): Promise<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS>> {
    // verify all base parity inputs
    //await Promise.all(inputs.children.map(child => this.verifyProof('BaseParityArtifact', child.proof)));

    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    const [outputWitness, proof] = await this.createRecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS>(
      witnessMap,
      'RootParityArtifact',
    );

    const result = convertRootParityOutputsFromWitnessMap(outputWitness);

    logger.debug(`Public inputs sha root: ${result.shaRoot.toString()}`);
    logger.debug(`Public inputs converted root: ${result.convertedRoot.toString()}`);

    const verificationKey = await this.getVerificationKeyDataForCircuit('RootParityArtifact');

    const vk = new VerificationKey(verificationKey.keyAsFields, verificationKey.hash);

    return Promise.resolve(new RootParityInput(proof, vk, result));
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

    const [outputWitness, proof] = await this.createProof(witnessMap, 'RootRollupArtifact');

    await this.verifyProof('RootRollupArtifact', proof);

    const result = convertRootRollupOutputsFromWitnessMap(outputWitness);
    return Promise.resolve([result, proof]);
  }

  // TODO(@PhilWindle): Delete when no longer required
  public async createProof(witnessMap: WitnessMap, circuitType: ServerProtocolArtifact): Promise<[WitnessMap, Proof]> {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    await fs.access(bbWorkingDirectory);

    // Have the ACVM write the partial witness here
    const outputWitnessFile = `${bbWorkingDirectory}/partial-witness.gz`;

    // Generate the partial witness using the ACVM
    // A further temp directory will be created beneath ours and then cleaned up after the partial witness has been copied to our specified location
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = ServerCircuitArtifacts[circuitType];

    logger.debug(`Generating witness data for ${circuitType}`);

    const outputWitness = await simulator.simulateCircuit(witnessMap, artifact);

    // Now prove the circuit from the generated witness
    logger.debug(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      bbWorkingDirectory,
      circuitType,
      artifact,
      outputWitnessFile,
      logger.debug,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for ${circuitType}: ${provingResult.reason}`);
      throw new Error(provingResult.reason);
    }

    // Ensure our vk cache is up to date
    await this.updateVerificationKeyAfterProof(provingResult.vkPath!, circuitType);

    // Read the proof and then cleanup up our temporary directory
    const proof = await fs.readFile(`${provingResult.proofPath!}/${proofFileName}`);

    //await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    logger.info(`Generated proof for ${circuitType} in ${provingResult.duration} ms, size: ${proof.length} fields`);

    return [outputWitness, new Proof(proof)];
  }

  public async createRecursiveProof<PROOF_LENGTH extends number>(
    witnessMap: WitnessMap,
    circuitType: ServerProtocolArtifact,
  ): Promise<[WitnessMap, RecursiveProof<PROOF_LENGTH>]> {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    await fs.access(bbWorkingDirectory);

    // Have the ACVM write the partial witness here
    const outputWitnessFile = `${bbWorkingDirectory}/partial-witness.gz`;

    // Generate the partial witness using the ACVM
    // A further temp directory will be created beneath ours and then cleaned up after the partial witness has been copied to our specified location
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = ServerCircuitArtifacts[circuitType];

    logger.debug(`Generating witness data for ${circuitType}`);

    const outputWitness = await simulator.simulateCircuit(witnessMap, artifact);

    // Now prove the circuit from the generated witness
    logger.debug(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      bbWorkingDirectory,
      circuitType,
      artifact,
      outputWitnessFile,
      logger.debug,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for ${circuitType}: ${provingResult.reason}`);
      throw new Error(provingResult.reason);
    }

    // Ensure our vk cache is up to date
    await this.updateVerificationKeyAfterProof(provingResult.vkPath!, circuitType);

    // Read the proof and then cleanup up our temporary directory
    const proof = await this.readProofAsFields<PROOF_LENGTH>(provingResult.proofPath!, circuitType);

    //await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    logger.info(
      `Generated proof for ${circuitType} in ${provingResult.duration} ms, size: ${proof.proof.length} fields`,
    );

    return [outputWitness, proof];
  }

  public async verifyProof(circuitType: ServerProtocolArtifact, proof: Proof) {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    const proofFileName = `${bbWorkingDirectory}/proof`;
    const verificationKeyPath = `${bbWorkingDirectory}/vk`;
    const verificationKey = await this.getVerificationKeyDataForCircuit(circuitType);

    logger.debug(`Verifying with key: ${verificationKey.hash.toString()}`);

    if (!verificationKey) {
      throw new Error(`Unable to verify proof for circuit ${circuitType}, verification key not available`);
    }

    await fs.writeFile(proofFileName, proof.buffer);
    await fs.writeFile(verificationKeyPath, verificationKey.keyAsBytes);

    const logFunction = (message: string) => {
      logger.debug(`${circuitType} BB out - ${message}`);
    };

    const result = await verifyProof(this.config.bbBinaryPath, proofFileName, verificationKeyPath!, logFunction);

    await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    if (result.status === BB_RESULT.FAILURE) {
      const errorMessage = `Failed to verify ${circuitType} proof!`;
      throw new Error(errorMessage);
    }

    logger.info(`Successfully verified ${circuitType} proof in ${result.duration} ms`);
  }

  private async verifyPreviousRollupProof(previousRollupData: PreviousRollupData) {
    const proof = previousRollupData.proof;
    const circuitType =
      previousRollupData.baseOrMergeRollupPublicInputs.rollupType === RollupTypes.Base
        ? 'BaseRollupArtifact'
        : 'MergeRollupArtifact';
    await this.verifyProof(circuitType, proof);
  }

  public async getPublicKernelProof(
    kernelRequest: PublicKernelNonTailRequest,
  ): Promise<[PublicKernelCircuitPublicInputs, Proof]> {
    const kernelOps = KernelArtifactMapping[kernelRequest.type];
    if (kernelOps === undefined) {
      throw new Error(`Unable to prove kernel type ${PublicKernelType[kernelRequest.type]}`);
    }
    const witnessMap = kernelOps.convertInputs(kernelRequest.inputs);

    const [outputWitness, proof] = await this.createProof(witnessMap, kernelOps.artifact);

    const result = kernelOps.convertOutputs(outputWitness);
    return Promise.resolve([result, proof]);
  }

  public async getPublicTailProof(kernelRequest: PublicKernelTailRequest): Promise<[KernelCircuitPublicInputs, Proof]> {
    const witnessMap = convertPublicTailInputsToWitnessMap(kernelRequest.inputs);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'PublicKernelTailArtifact');

    const result = convertPublicTailOutputFromWitnessMap(outputWitness);
    return [result, proof];
  }

  public async getVerificationKeyForCircuit(circuitType: ServerProtocolArtifact): Promise<VerificationKey> {
    const vkData = await this.getVerificationKeyDataForCircuit(circuitType);
    return new VerificationKey(vkData.keyAsFields, vkData.hash);
  }

  private async getVerificationKeyDataForCircuit(circuitType: ServerProtocolArtifact): Promise<VerificationKeyData> {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      promise = generateKeyForNoirCircuit(
        this.config.bbBinaryPath,
        this.config.bbWorkingDirectory,
        circuitType,
        ServerCircuitArtifacts[circuitType],
        'vk',
        logger.debug,
      ).then(result => {
        if (result.status === BB_RESULT.FAILURE) {
          throw new Error(`Failed to generate verification key for ${circuitType}, ${result.reason}`);
        }
        return this.convertVk(result.vkPath!);
      });
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  private async convertVk(filePath: string) {
    const rawFields = await fs.readFile(`${filePath}/${vkFieldsFileName}`, { encoding: 'utf-8' });
    const rawBinary = await fs.readFile(`${filePath}/${vkFileName}`);
    const fieldsJson = JSON.parse(rawFields);
    const fields = fieldsJson.fields.map(Fr.fromString);
    const vk: VerificationKeyData = {
      hash: Fr.fromString(fieldsJson.hash),
      keyAsFields: fields as Tuple<Fr, typeof VK_KEY_SIZE_IN_FIELDS>,
      keyAsBytes: rawBinary,
      numPublicInputs: fieldsJson.num_public_inputs,
    };
    logger.debug(`VK HASH: ${vk.hash.toString()}`);
    return vk;
  }

  private async updateVerificationKeyAfterProof(filePath: string, circuitType: ServerProtocolArtifact) {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      logger.debug(`Converting vk for circuit ${circuitType} to fields`);
      promise = this.convertVk(filePath);
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  private async readProofAsFields<PROOF_LENGTH extends number>(
    filePath: string,
    circuitType: ServerProtocolArtifact,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    const binaryProof = await fs.readFile(`${filePath}/${proofFileName}`);
    const proofString = await fs.readFile(`${filePath}/${proofFieldsFileName}`, { encoding: 'utf-8' });
    const json = JSON.parse(proofString);
    logger.debug(`[${json[0]}] - [${json[1]}]`);
    const fields = json.map(Fr.fromString);
    const vkData = await this.verificationKeys.get(circuitType);
    if (!vkData) {
      throw new Error(`Invalid verification key for ${circuitType}`);
    }
    const fieldsWithoutPublicInputs = fields.slice(2);
    logger.debug(
      `Circuit type: ${circuitType}, complete proof length: ${fields.length}, without public inputs: ${fieldsWithoutPublicInputs.length}, num public inputs: ${vkData.numPublicInputs}, raw length: ${binaryProof.length}`,
    );
    const proof = new RecursiveProof<PROOF_LENGTH>(fieldsWithoutPublicInputs, new Proof(binaryProof));
    return proof;
  }
}
