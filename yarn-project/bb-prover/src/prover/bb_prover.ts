/* eslint-disable require-await */
import {
  type ProofAndVerificationKey,
  ProvingError,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import { type CircuitProvingStats, type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  AGGREGATION_OBJECT_LENGTH,
  AVM_PROOF_LENGTH_IN_FIELDS,
  type AvmCircuitInputs,
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  EmptyNestedCircuitInputs,
  EmptyNestedData,
  Fr,
  IPA_CLAIM_LENGTH,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type ParityPublicInputs,
  type PrivateBaseRollupInputs,
  type PrivateKernelEmptyInputData,
  PrivateKernelEmptyInputs,
  Proof,
  type PublicBaseRollupInputs,
  RECURSIVE_PROOF_LENGTH,
  RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RecursiveProof,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  type TubeInputs,
  type VerificationKeyAsFields,
  type VerificationKeyData,
  makeRecursiveProofFromBinary,
} from '@aztec/circuits.js';
import { runInDirectory } from '@aztec/foundation/fs';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';
import {
  ProtocolCircuitVks,
  ServerCircuitArtifacts,
  type ServerProtocolArtifact,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBlockMergeRollupInputsToWitnessMap,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertBlockRootRollupInputsToWitnessMap,
  convertBlockRootRollupOutputsFromWitnessMap,
  convertEmptyBlockRootRollupInputsToWitnessMap,
  convertEmptyBlockRootRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertPrivateBaseRollupInputsToWitnessMap,
  convertPrivateBaseRollupOutputsFromWitnessMap,
  convertPrivateKernelEmptyInputsToWitnessMap,
  convertPrivateKernelEmptyOutputsFromWitnessMap,
  convertPublicBaseRollupInputsToWitnessMap,
  convertPublicBaseRollupOutputsFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { NativeACVMSimulator } from '@aztec/simulator';
import { Attributes, type TelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { abiEncode } from '@noir-lang/noirc_abi';
import { type Abi, type WitnessMap } from '@noir-lang/types';
import { assert } from 'console';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import {
  type BBFailure,
  type BBSuccess,
  BB_RESULT,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  VK_FILENAME,
  generateAvmProof,
  generateKeyForNoirCircuit,
  generateProof,
  generateTubeProof,
  verifyAvmProof,
  verifyProof,
  writeProofAsFields,
} from '../bb/execute.js';
import type { ACVMConfig, BBConfig } from '../config.js';
import { type UltraHonkFlavor, getUltraHonkFlavorForCircuit } from '../honk.js';
import { ProverInstrumentation } from '../instrumentation.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
import { extractAvmVkData, extractVkData } from '../verification_key/verification_key_data.js';

const logger = createLogger('bb-prover');

// All `ServerCircuitArtifact` are recursive.
const SERVER_CIRCUIT_RECURSIVE = true;

export interface BBProverConfig extends BBConfig, ACVMConfig {
  // list of circuits supported by this prover. defaults to all circuits if empty
  circuitFilter?: ServerProtocolArtifact[];
}

/**
 * Prover implementation that uses barretenberg native proving
 */
export class BBNativeRollupProver implements ServerCircuitProver {
  private verificationKeys = new Map<
    `ultra${'_keccak_' | '_' | '_rollup_'}honk_${ServerProtocolArtifact}`,
    Promise<VerificationKeyData>
  >();

  private instrumentation: ProverInstrumentation;

  constructor(private config: BBProverConfig, telemetry: TelemetryClient) {
    this.instrumentation = new ProverInstrumentation(telemetry, 'BBNativeRollupProver');
  }

  get tracer() {
    return this.instrumentation.tracer;
  }

  static async new(config: BBProverConfig, telemetry: TelemetryClient) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using native BB at ${config.bbBinaryPath} and working directory ${config.bbWorkingDirectory}`);
    logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);

    return new BBNativeRollupProver(config, telemetry);
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('BBNativeRollupProver.getBaseParityProof', { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'base-parity' })
  public async getBaseParityProof(
    inputs: BaseParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      'BaseParityArtifact',
      RECURSIVE_PROOF_LENGTH,
      convertBaseParityInputsToWitnessMap,
      convertBaseParityOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('BaseParityArtifact');
    await this.verifyProof('BaseParityArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('BBNativeRollupProver.getRootParityProof', { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'root-parity' })
  public async getRootParityProof(
    inputs: RootParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      'RootParityArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertRootParityInputsToWitnessMap,
      convertRootParityOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('RootParityArtifact');
    await this.verifyProof('RootParityArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Creates an AVM proof and verifies it.
   * @param inputs - The inputs to the AVM circuit.
   * @returns The proof.
   */
  @trackSpan('BBNativeRollupProver.getAvmProof', inputs => ({
    [Attributes.APP_CIRCUIT_NAME]: inputs.functionName,
  }))
  public async getAvmProof(
    inputs: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    const proofAndVk = await this.createAvmProof(inputs);
    await this.verifyAvmProof(proofAndVk.proof.binaryProof, proofAndVk.verificationKey);
    return proofAndVk;
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getPrivateBaseRollupProof(
    inputs: PrivateBaseRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const artifactName = 'PrivateBaseRollupArtifact';

    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      artifactName,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPrivateBaseRollupInputsToWitnessMap,
      convertPrivateBaseRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit(artifactName);

    await this.verifyProof(artifactName, proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Requests that the public kernel tail circuit be executed and the proof generated
   * @param kernelRequest - The object encapsulating the request for a proof
   * @returns The requested circuit's public inputs and proof
   */
  public async getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const artifactName = 'PublicBaseRollupArtifact';

    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      artifactName,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPublicBaseRollupInputsToWitnessMap,
      convertPublicBaseRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit(artifactName);

    await this.verifyProof(artifactName, proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getMergeRollupProof(
    input: MergeRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      input,
      'MergeRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertMergeRollupInputsToWitnessMap,
      convertMergeRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('MergeRollupArtifact');

    await this.verifyProof('MergeRollupArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBlockRootRollupProof(
    input: BlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      input,
      'BlockRootRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootRollupInputsToWitnessMap,
      convertBlockRootRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('BlockRootRollupArtifact');

    await this.verifyProof('BlockRootRollupArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the empty block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      input,
      'EmptyBlockRootRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertEmptyBlockRootRollupInputsToWitnessMap,
      convertEmptyBlockRootRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('EmptyBlockRootRollupArtifact');

    await this.verifyProof('EmptyBlockRootRollupArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the block merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      input,
      'BlockMergeRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockMergeRollupInputsToWitnessMap,
      convertBlockMergeRollupOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('BlockMergeRollupArtifact');

    await this.verifyProof('BlockMergeRollupArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(
    input: RootRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    const { circuitOutput, proof } = await this.createProof(
      input,
      'RootRollupArtifact',
      convertRootRollupInputsToWitnessMap,
      convertRootRollupOutputsFromWitnessMap,
    );

    const recursiveProof = makeRecursiveProofFromBinary(proof, NESTED_RECURSIVE_PROOF_LENGTH);

    const verificationKey = await this.getVerificationKeyDataForCircuit('RootRollupArtifact');

    await this.verifyProof('RootRollupArtifact', proof);

    return makePublicInputsAndRecursiveProof(circuitOutput, recursiveProof, verificationKey);
  }

  public async getEmptyPrivateKernelProof(
    inputs: PrivateKernelEmptyInputData,
  ): Promise<
    PublicInputsAndRecursiveProof<KernelCircuitPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const emptyNested = await this.getEmptyNestedProof();
    const emptyPrivateKernelProof = await this.getEmptyPrivateKernelProofFromEmptyNested(
      PrivateKernelEmptyInputs.from({
        ...inputs,
        emptyNested,
      }),
    );

    return emptyPrivateKernelProof;
  }

  private async getEmptyNestedProof(): Promise<EmptyNestedData> {
    const inputs = new EmptyNestedCircuitInputs();
    const { proof } = await this.createRecursiveProof(
      inputs,
      'EmptyNestedArtifact',
      RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      (nothing: any) => abiEncode(ServerCircuitArtifacts.EmptyNestedArtifact.abi as Abi, { _inputs: nothing as any }),
      () => new EmptyNestedCircuitInputs(),
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('EmptyNestedArtifact');
    await this.verifyProof('EmptyNestedArtifact', proof.binaryProof);
    // logger.debug(`EmptyNestedData proof size: ${proof.proof.length}`);
    // logger.debug(`EmptyNestedData proof: ${proof.proof}`);
    // logger.debug(`EmptyNestedData vk size: ${verificationKey.keyAsFields.key.length}`);
    // logger.debug(`EmptyNestedData vk: ${verificationKey.keyAsFields.key}`);

    return new EmptyNestedData(proof, verificationKey.keyAsFields);
  }

  private async getEmptyPrivateKernelProofFromEmptyNested(
    inputs: PrivateKernelEmptyInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<KernelCircuitPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      'PrivateKernelEmptyArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPrivateKernelEmptyInputsToWitnessMap,
      convertPrivateKernelEmptyOutputsFromWitnessMap,
    );
    //info(`proof: ${proof.proof}`);
    const verificationKey = ProtocolCircuitVks['PrivateKernelEmptyArtifact'];
    await this.verifyProof('PrivateKernelEmptyArtifact', proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  private async generateProofWithBB<
    Input extends { toBuffer: () => Buffer },
    Output extends { toBuffer: () => Buffer },
  >(
    input: Input,
    circuitType: ServerProtocolArtifact,
    convertInput: (input: Input) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => Output,
    workingDirectory: string,
  ): Promise<{ circuitOutput: Output; vkData: VerificationKeyData; provingResult: BBSuccess }> {
    // Have the ACVM write the partial witness here
    const outputWitnessFile = path.join(workingDirectory, 'partial-witness.gz');

    // Generate the partial witness using the ACVM
    // A further temp directory will be created beneath ours and then cleaned up after the partial witness has been copied to our specified location
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = ServerCircuitArtifacts[circuitType];

    logger.debug(`Generating witness data for ${circuitType}`);

    const inputWitness = convertInput(input);
    const timer = new Timer();
    const outputWitness = await simulator.simulateCircuit(inputWitness, artifact);
    const output = convertOutput(outputWitness);

    const circuitName = mapProtocolArtifactNameToCircuitName(circuitType);
    this.instrumentation.recordDuration('witGenDuration', circuitName, timer);
    this.instrumentation.recordSize('witGenInputSize', circuitName, input.toBuffer().length);
    this.instrumentation.recordSize('witGenOutputSize', circuitName, output.toBuffer().length);

    logger.info(`Generated witness`, {
      circuitName,
      duration: timer.ms(),
      inputSize: input.toBuffer().length,
      outputSize: output.toBuffer().length,
      eventName: 'circuit-witness-generation',
    } satisfies CircuitWitnessGenerationStats);

    // Now prove the circuit from the generated witness
    logger.debug(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      workingDirectory,
      circuitType,
      Buffer.from(artifact.bytecode, 'base64'),
      SERVER_CIRCUIT_RECURSIVE,
      outputWitnessFile,
      getUltraHonkFlavorForCircuit(circuitType),
      logger.debug,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for ${circuitType}: ${provingResult.reason}`);
      throw new ProvingError(provingResult.reason, provingResult, provingResult.retry);
    }

    // Ensure our vk cache is up to date
    const vkData = await this.updateVerificationKeyAfterProof(provingResult.vkPath!, circuitType);

    return {
      circuitOutput: output,
      vkData,
      provingResult,
    };
  }

  private async createProof<Input extends { toBuffer: () => Buffer }, Output extends { toBuffer: () => Buffer }>(
    input: Input,
    circuitType: ServerProtocolArtifact,
    convertInput: (input: Input) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => Output,
  ): Promise<{ circuitOutput: Output; proof: Proof }> {
    const operation = async (bbWorkingDirectory: string) => {
      const {
        provingResult,
        vkData,
        circuitOutput: output,
      } = await this.generateProofWithBB(input, circuitType, convertInput, convertOutput, bbWorkingDirectory);

      // Read the binary proof
      const rawProof = await fs.readFile(`${provingResult.proofPath!}/${PROOF_FILENAME}`);

      const proof = new Proof(rawProof, vkData.numPublicInputs);
      const circuitName = mapProtocolArtifactNameToCircuitName(circuitType);

      this.instrumentation.recordDuration('provingDuration', circuitName, provingResult.durationMs);
      this.instrumentation.recordSize('proofSize', circuitName, proof.buffer.length);
      this.instrumentation.recordSize('circuitPublicInputCount', circuitName, vkData.numPublicInputs);
      this.instrumentation.recordSize('circuitSize', circuitName, vkData.circuitSize);

      logger.info(`Generated proof for ${circuitType} in ${Math.ceil(provingResult.durationMs)} ms`, {
        circuitName,
        // does not include reading the proof from disk
        duration: provingResult.durationMs,
        proofSize: proof.buffer.length,
        eventName: 'circuit-proving',
        // circuitOutput is the partial witness that became the input to the proof
        inputSize: output.toBuffer().length,
        circuitSize: vkData.circuitSize,
        numPublicInputs: vkData.numPublicInputs,
      } satisfies CircuitProvingStats);

      return { circuitOutput: output, proof };
    };
    return await this.runInDirectory(operation);
  }

  private async generateAvmProofWithBB(input: AvmCircuitInputs, workingDirectory: string): Promise<BBSuccess> {
    logger.info(`Proving avm-circuit for ${input.functionName}...`);

    const provingResult = await generateAvmProof(this.config.bbBinaryPath, workingDirectory, input, logger);

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate AVM proof for ${input.functionName}: ${provingResult.reason}`);
      throw new ProvingError(provingResult.reason, provingResult, provingResult.retry);
    }

    return provingResult;
  }

  private async generateTubeProofWithBB(bbWorkingDirectory: string, input: TubeInputs): Promise<BBSuccess> {
    logger.debug(`Proving tube...`);

    const hasher = crypto.createHash('sha256');
    hasher.update(input.toBuffer());

    await input.clientIVCData.writeToOutputDirectory(bbWorkingDirectory);
    const provingResult = await generateTubeProof(this.config.bbBinaryPath, bbWorkingDirectory, logger.verbose);

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for tube circuit: ${provingResult.reason}`);
      throw new ProvingError(provingResult.reason, provingResult, provingResult.retry);
    }
    return provingResult;
  }

  private async createAvmProof(
    input: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    const operation = async (bbWorkingDirectory: string) => {
      const provingResult = await this.generateAvmProofWithBB(input, bbWorkingDirectory);

      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6773): this VK data format is wrong.
      // In particular, the number of public inputs, etc will be wrong.
      const verificationKey = await extractAvmVkData(provingResult.vkPath!);
      const avmProof = await this.readAvmProofAsFields(provingResult.proofPath!, verificationKey);

      const circuitType = 'avm-circuit' as const;
      const appCircuitName = 'unknown' as const;
      this.instrumentation.recordAvmDuration('provingDuration', appCircuitName, provingResult.durationMs);
      this.instrumentation.recordAvmSize('proofSize', appCircuitName, avmProof.binaryProof.buffer.length);
      this.instrumentation.recordAvmSize('circuitPublicInputCount', appCircuitName, verificationKey.numPublicInputs);
      this.instrumentation.recordAvmSize('circuitSize', appCircuitName, verificationKey.circuitSize);

      logger.info(
        `Generated proof for ${circuitType}(${input.functionName}) in ${Math.ceil(provingResult.durationMs)} ms`,
        {
          circuitName: circuitType,
          appCircuitName: input.functionName,
          // does not include reading the proof from disk
          duration: provingResult.durationMs,
          proofSize: avmProof.binaryProof.buffer.length,
          eventName: 'circuit-proving',
          inputSize: input.toBuffer().length,
          circuitSize: verificationKey.circuitSize, // FIX: wrong in VK
          numPublicInputs: verificationKey.numPublicInputs, // FIX: wrong in VK
        } satisfies CircuitProvingStats,
      );

      return makeProofAndVerificationKey(avmProof, verificationKey);
    };
    return await this.runInDirectory(operation);
  }

  public async getTubeProof(input: TubeInputs): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    // this probably is gonna need to call client ivc
    const operation = async (bbWorkingDirectory: string) => {
      logger.debug(`createTubeProof: ${bbWorkingDirectory}`);
      const provingResult = await this.generateTubeProofWithBB(bbWorkingDirectory, input);

      // Read the proof as fields
      const tubeVK = await extractVkData(provingResult.vkPath!);
      const tubeProof = await this.readProofAsFields(provingResult.proofPath!, tubeVK, TUBE_PROOF_LENGTH);

      this.instrumentation.recordDuration('provingDuration', 'tubeCircuit', provingResult.durationMs);
      this.instrumentation.recordSize('proofSize', 'tubeCircuit', tubeProof.binaryProof.buffer.length);
      this.instrumentation.recordSize('circuitPublicInputCount', 'tubeCircuit', tubeVK.numPublicInputs);
      this.instrumentation.recordSize('circuitSize', 'tubeCircuit', tubeVK.circuitSize);

      // Sanity check the tube proof (can be removed later)
      await this.verifyWithKey('ultra_rollup_honk', tubeVK, tubeProof.binaryProof);

      logger.info(
        `Generated proof for tubeCircuit in ${Math.ceil(provingResult.durationMs)} ms, size: ${
          tubeProof.proof.length
        } fields`,
      );

      return makeProofAndVerificationKey(tubeProof, tubeVK);
    };
    return await this.runInDirectory(operation);
  }

  /**
   * Executes a circuit and returns its outputs and corresponding proof with embedded aggregation object
   * @param witnessMap - The input witness
   * @param circuitType - The type of circuit to be executed
   * @param proofLength - The length of the proof to be generated. This is a dummy parameter to aid in type checking
   * @param convertInput - Function for mapping the input object to a witness map.
   * @param convertOutput - Function for parsing the output witness to it's corresponding object
   * @returns The circuits output object and it's proof
   */
  private async createRecursiveProof<
    PROOF_LENGTH extends number,
    CircuitInputType extends { toBuffer: () => Buffer },
    CircuitOutputType extends { toBuffer: () => Buffer },
  >(
    input: CircuitInputType,
    circuitType: ServerProtocolArtifact,
    proofLength: PROOF_LENGTH,
    convertInput: (input: CircuitInputType) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => CircuitOutputType,
  ): Promise<{ circuitOutput: CircuitOutputType; proof: RecursiveProof<PROOF_LENGTH> }> {
    // this probably is gonna need to call client ivc
    const operation = async (bbWorkingDirectory: string) => {
      const {
        provingResult,
        vkData,
        circuitOutput: output,
      } = await this.generateProofWithBB(input, circuitType, convertInput, convertOutput, bbWorkingDirectory);

      // Read the proof as fields
      const proof = await this.readProofAsFields(provingResult.proofPath!, vkData, proofLength);

      const circuitName = mapProtocolArtifactNameToCircuitName(circuitType);
      this.instrumentation.recordDuration('provingDuration', circuitName, provingResult.durationMs);
      this.instrumentation.recordSize('proofSize', circuitName, proof.binaryProof.buffer.length);
      this.instrumentation.recordSize('circuitPublicInputCount', circuitName, vkData.numPublicInputs);
      this.instrumentation.recordSize('circuitSize', circuitName, vkData.circuitSize);
      logger.info(
        `Generated proof for ${circuitType} in ${Math.ceil(provingResult.durationMs)} ms, size: ${
          proof.proof.length
        } fields`,
        {
          circuitName,
          circuitSize: vkData.circuitSize,
          duration: provingResult.durationMs,
          inputSize: output.toBuffer().length,
          proofSize: proof.binaryProof.buffer.length,
          eventName: 'circuit-proving',
          numPublicInputs: vkData.numPublicInputs,
        } satisfies CircuitProvingStats,
      );

      return {
        circuitOutput: output,
        proof,
      };
    };
    return await this.runInDirectory(operation);
  }

  /**
   * Verifies a proof, will generate the verification key if one is not cached internally
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProof(circuitType: ServerProtocolArtifact, proof: Proof) {
    const verificationKey = await this.getVerificationKeyDataForCircuit(circuitType);
    return await this.verifyWithKey(getUltraHonkFlavorForCircuit(circuitType), verificationKey, proof);
  }

  public async verifyAvmProof(proof: Proof, verificationKey: VerificationKeyData) {
    return await this.verifyWithKeyInternal(proof, verificationKey, (proofPath, vkPath) =>
      verifyAvmProof(this.config.bbBinaryPath, proofPath, vkPath, logger.debug),
    );
  }

  public async verifyWithKey(flavor: UltraHonkFlavor, verificationKey: VerificationKeyData, proof: Proof) {
    return await this.verifyWithKeyInternal(proof, verificationKey, (proofPath, vkPath) =>
      verifyProof(this.config.bbBinaryPath, proofPath, vkPath, flavor, logger.debug),
    );
  }

  private async verifyWithKeyInternal(
    proof: Proof,
    verificationKey: { keyAsBytes: Buffer },
    verificationFunction: (proofPath: string, vkPath: string) => Promise<BBFailure | BBSuccess>,
  ) {
    const operation = async (bbWorkingDirectory: string) => {
      const proofFileName = path.join(bbWorkingDirectory, PROOF_FILENAME);
      const verificationKeyPath = path.join(bbWorkingDirectory, VK_FILENAME);

      await fs.writeFile(proofFileName, proof.buffer);
      await fs.writeFile(verificationKeyPath, verificationKey.keyAsBytes);

      const result = await verificationFunction(proofFileName, verificationKeyPath!);

      if (result.status === BB_RESULT.FAILURE) {
        const errorMessage = `Failed to verify proof from key!`;
        throw new ProvingError(errorMessage, result, result.retry);
      }

      logger.info(`Successfully verified proof from key in ${result.durationMs} ms`);
    };

    await this.runInDirectory(operation);
  }

  /**
   * Returns the verification key for a circuit, will generate it if not cached internally
   * @param circuitType - The type of circuit for which the verification key is required
   * @returns The verification key
   */
  public async getVerificationKeyForCircuit(circuitType: ServerProtocolArtifact): Promise<VerificationKeyAsFields> {
    const vkData = await this.getVerificationKeyDataForCircuit(circuitType);
    return vkData.clone().keyAsFields;
  }

  /**
   * Will check a recursive proof argument for validity of it's 'fields' format of proof and convert if required
   * @param proof - The input proof that may need converting
   * @returns - The valid proof
   */
  public async ensureValidProof(
    proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>, // WORKTODO
    circuit: ServerProtocolArtifact,
    vk: VerificationKeyData,
  ) {
    // If the 'fields' proof is already valid then simply return
    // This will be false for proofs coming from clients
    if (proof.fieldsValid) {
      return proof;
    }

    const operation = async (bbWorkingDirectory: string) => {
      const numPublicInputs = vk.numPublicInputs - AGGREGATION_OBJECT_LENGTH - IPA_CLAIM_LENGTH;
      const proofFullFilename = path.join(bbWorkingDirectory, PROOF_FILENAME);
      const vkFullFilename = path.join(bbWorkingDirectory, VK_FILENAME);

      logger.debug(
        `Converting proof to fields format for circuit ${circuit}, directory ${bbWorkingDirectory}, num public inputs: ${vk.numPublicInputs}, proof length ${proof.binaryProof.buffer.length}, vk length ${vk.keyAsBytes.length}`,
      );

      await fs.writeFile(proofFullFilename, proof.binaryProof.buffer);
      await fs.writeFile(vkFullFilename, vk.keyAsBytes);

      const logFunction = (message: string) => {
        logger.debug(`${circuit} BB out - ${message}`);
      };

      const result = await writeProofAsFields(
        this.config.bbBinaryPath,
        bbWorkingDirectory,
        PROOF_FILENAME,
        vkFullFilename,
        logFunction,
      );

      if (result.status === BB_RESULT.FAILURE) {
        const errorMessage = `Failed to convert ${circuit} proof to fields, ${result.reason}`;
        throw new ProvingError(errorMessage, result, result.retry);
      }

      const proofString = await fs.readFile(path.join(bbWorkingDirectory, PROOF_FIELDS_FILENAME), {
        encoding: 'utf-8',
      });
      const json = JSON.parse(proofString);
      const fields = json
        .slice(0, 3)
        .map(Fr.fromHexString)
        .concat(json.slice(3 + numPublicInputs).map(Fr.fromHexString));
      return new RecursiveProof(
        fields,
        new Proof(proof.binaryProof.buffer, vk.numPublicInputs),
        true,
        NESTED_RECURSIVE_PROOF_LENGTH, // WORKTODO
      );
    };
    return await this.runInDirectory(operation);
  }

  /**
   * Returns the verification key data for a circuit, will generate and cache it if not cached internally
   * @param circuitType - The type of circuit for which the verification key is required
   * @returns The verification key data
   */
  private async getVerificationKeyDataForCircuit(circuitType: ServerProtocolArtifact): Promise<VerificationKeyData> {
    const flavor = getUltraHonkFlavorForCircuit(circuitType);
    let promise = this.verificationKeys.get(`${flavor}_${circuitType}`);
    if (!promise) {
      promise = generateKeyForNoirCircuit(
        this.config.bbBinaryPath,
        this.config.bbWorkingDirectory,
        circuitType,
        ServerCircuitArtifacts[circuitType],
        SERVER_CIRCUIT_RECURSIVE,
        flavor,
        logger.debug,
      ).then(result => {
        if (result.status === BB_RESULT.FAILURE) {
          throw new ProvingError(
            `Failed to generate verification key for ${circuitType}, ${result.reason}`,
            result,
            result.retry,
          );
        }
        return extractVkData(result.vkPath!);
      });
      this.verificationKeys.set(`${flavor}_${circuitType}`, promise);
    }
    const vk = await promise;
    return vk.clone();
  }

  /**
   * Ensures our verification key cache includes the key data located at the specified directory
   * @param filePath - The directory containing the verification key data files
   * @param circuitType - The type of circuit to which the verification key corresponds
   */
  private async updateVerificationKeyAfterProof(
    filePath: string,
    circuitType: ServerProtocolArtifact,
  ): Promise<VerificationKeyData> {
    const flavor = getUltraHonkFlavorForCircuit(circuitType);
    let promise = this.verificationKeys.get(`${flavor}_${circuitType}`);
    if (!promise) {
      promise = extractVkData(filePath);
      this.verificationKeys.set(`${flavor}_${circuitType}`, promise);
    }
    return promise;
  }

  private async readProofAsFields<PROOF_LENGTH extends number>(
    filePath: string,
    vkData: VerificationKeyData,
    proofLength: PROOF_LENGTH,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    const proofFilename = path.join(filePath, PROOF_FILENAME);
    const proofFieldsFilename = path.join(filePath, PROOF_FIELDS_FILENAME);

    const [binaryProof, proofString] = await Promise.all([
      fs.readFile(proofFilename),
      fs.readFile(proofFieldsFilename, { encoding: 'utf-8' }),
    ]);

    const json = JSON.parse(proofString);

    let numPublicInputs = vkData.numPublicInputs - AGGREGATION_OBJECT_LENGTH;
    if (proofLength == NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH) {
      numPublicInputs -= IPA_CLAIM_LENGTH;
    }

    assert(json.length - numPublicInputs == proofLength, 'Proof length mismatch');

    const fieldsWithoutPublicInputs = json
      .slice(0, 3)
      .map(Fr.fromHexString)
      .concat(json.slice(3 + numPublicInputs).map(Fr.fromHexString));
    logger.debug(
      `Circuit path: ${filePath}, complete proof length: ${json.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}, is recursive: ${vkData.isRecursive}, raw length: ${binaryProof.length}`,
    );

    return new RecursiveProof(fieldsWithoutPublicInputs, new Proof(binaryProof, numPublicInputs), true, proofLength);
  }

  private async readAvmProofAsFields(
    proofFilename: string,
    vkData: VerificationKeyData,
  ): Promise<RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    const rawProof = await fs.readFile(proofFilename);

    const reader = BufferReader.asReader(rawProof);
    const fields = reader.readArray(rawProof.length / Fr.SIZE_IN_BYTES, Fr);
    const fieldsWithoutPublicCols = fields.slice(-1 * AVM_PROOF_LENGTH_IN_FIELDS);

    const proof = new Proof(rawProof, vkData.numPublicInputs);

    return new RecursiveProof(fieldsWithoutPublicCols, proof, true, AVM_PROOF_LENGTH_IN_FIELDS);
  }

  private runInDirectory<T>(fn: (dir: string) => Promise<T>) {
    return runInDirectory(
      this.config.bbWorkingDirectory,
      (dir: string) =>
        fn(dir).catch(err => {
          logger.error(`Error running operation at ${dir}: ${err}`);
          throw err;
        }),
      this.config.bbSkipCleanup,
    );
  }
}
