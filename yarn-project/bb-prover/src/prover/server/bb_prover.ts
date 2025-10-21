import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  PAIRING_POINTS_SIZE,
  RECURSIVE_PROOF_LENGTH,
  ULTRA_KECCAK_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { runInDirectory } from '@aztec/foundation/fs';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import {
  type ServerProtocolArtifact,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertBlockMergeRollupPrivateInputsToWitnessMap,
  convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap,
  convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootFirstRollupOutputsFromWitnessMap,
  convertBlockRootFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootRollupOutputsFromWitnessMap,
  convertBlockRootRollupPrivateInputsToWitnessMap,
  convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap,
  convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootSingleTxRollupOutputsFromWitnessMap,
  convertBlockRootSingleTxRollupPrivateInputsToWitnessMap,
  convertCheckpointMergeRollupOutputsFromWitnessMap,
  convertCheckpointMergeRollupPrivateInputsToWitnessMap,
  convertCheckpointPaddingRollupOutputsFromWitnessMap,
  convertCheckpointPaddingRollupPrivateInputsToWitnessMap,
  convertCheckpointRootRollupOutputsFromWitnessMap,
  convertCheckpointRootRollupPrivateInputsToWitnessMap,
  convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap,
  convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap,
  convertParityBaseOutputsFromWitnessMap,
  convertParityBasePrivateInputsToWitnessMap,
  convertParityRootOutputsFromWitnessMap,
  convertParityRootPrivateInputsToWitnessMap,
  convertPrivateTxBaseRollupOutputsFromWitnessMap,
  convertPrivateTxBaseRollupPrivateInputsToWitnessMap,
  convertPublicTubeOutputsFromWitnessMap,
  convertPublicTubePrivateInputsToWitnessMap,
  convertPublicTxBaseRollupOutputsFromWitnessMap,
  convertPublicTxBaseRollupPrivateInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
  convertRootRollupPrivateInputsToWitnessMap,
  convertTxMergeRollupOutputsFromWitnessMap,
  convertTxMergeRollupPrivateInputsToWitnessMap,
  getServerCircuitArtifact,
} from '@aztec/noir-protocol-circuits-types/server';
import { ServerCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import { mapProtocolArtifactNameToCircuitName } from '@aztec/noir-protocol-circuits-types/types';
import type { WitnessMap } from '@aztec/noir-types';
import { NativeACVMSimulator } from '@aztec/simulator/server';
import type { AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { ProvingError } from '@aztec/stdlib/errors';
import {
  type ProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityBasePrivateInputs, ParityPublicInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
import { Proof, RecursiveProof, makeRecursiveProofFromBinary } from '@aztec/stdlib/proofs';
import {
  BlockMergeRollupPrivateInputs,
  BlockRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
  type PrivateTxBaseRollupPrivateInputs,
  PublicTubePrivateInputs,
  PublicTubePublicInputs,
  PublicTxBaseRollupPrivateInputs,
  type RootRollupPrivateInputs,
  type RootRollupPublicInputs,
  type TxMergeRollupPrivateInputs,
  type TxRollupPublicInputs,
  enhanceProofWithPiValidationFlag,
} from '@aztec/stdlib/rollup';
import type { CircuitProvingStats, CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';
import type { VerificationKeyData } from '@aztec/stdlib/vks';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { promises as fs } from 'fs';
import * as path from 'path';

import { Barretenberg } from '@aztec/bb.js';

import { type BBFailure, type BBSuccess, BB_RESULT } from '../../bb/execute.js';
import type { ACVMConfig, BBConfig } from '../../config.js';
import { type UltraHonkFlavor, getUltraHonkFlavorForCircuit } from '../../honk.js';
import { ProverInstrumentation } from '../../instrumentation.js';
import { extractAvmVkData } from '../../verification_key/verification_key_data.js';
import { BBMsgpackProver } from '../../bb/msgpack_api.js';

const logger = createLogger('bb-prover');

export interface BBProverConfig extends BBConfig, ACVMConfig {
  // list of circuits supported by this prover. defaults to all circuits if empty
  circuitFilter?: ServerProtocolArtifact[];
}

/**
 * Prover implementation that uses barretenberg native proving
 */
export class BBNativeRollupProver implements ServerCircuitProver {
  private instrumentation: ProverInstrumentation;
  private bbApi!: Barretenberg;
  private bbMsgpackProver!: BBMsgpackProver;

  constructor(
    private config: BBProverConfig,
    telemetry: TelemetryClient,
  ) {
    this.instrumentation = new ProverInstrumentation(telemetry, 'BBNativeRollupProver');
  }

  get tracer() {
    return this.instrumentation.tracer;
  }

  static async new(config: BBProverConfig, telemetry: TelemetryClient = getTelemetryClient()) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using native BB at ${config.bbBinaryPath} and working directory ${config.bbWorkingDirectory}`);
    logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);

    const prover = new BBNativeRollupProver(config, telemetry);

    // Initialize bb.js msgpack native backend
    logger.info(`Initializing bb.js msgpack backend with ${config.bbThreads || 1} threads...`);
    prover.bbApi = await Barretenberg.new({
      threads: config.bbThreads || 1,
      bbPath: config.bbBinaryPath,
    });
    prover.bbMsgpackProver = new BBMsgpackProver(prover.bbApi, logger);
    logger.info(`bb.js msgpack backend initialized successfully`);

    return prover;
  }

  /**
   * Cleanup resources - destroys the bb.js API instance
   */
  async destroy() {
    if (this.bbApi) {
      logger.info('Destroying bb.js msgpack backend...');
      await this.bbApi.destroy();
    }
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('BBNativeRollupProver.getBaseParityProof', { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'parity-base' })
  public getBaseParityProof(
    inputs: ParityBasePrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      inputs,
      'ParityBaseArtifact',
      RECURSIVE_PROOF_LENGTH,
      convertParityBasePrivateInputsToWitnessMap,
      convertParityBaseOutputsFromWitnessMap,
    );
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('BBNativeRollupProver.getRootParityProof', { [Attributes.PROTOCOL_CIRCUIT_NAME]: 'parity-root' })
  public getRootParityProof(
    inputs: ParityRootPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      inputs,
      'ParityRootArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertParityRootPrivateInputsToWitnessMap,
      convertParityRootOutputsFromWitnessMap,
    );
  }

  /**
   * Creates an AVM proof and verifies it.
   * @param inputs - The inputs to the AVM circuit.
   * @returns The proof.
   */
  @trackSpan('BBNativeRollupProver.getAvmProof', inputs => ({
    [Attributes.APP_CIRCUIT_NAME]: inputs.hints.tx.hash,
  }))
  public async getAvmProof(
    inputs: AvmCircuitInputs,
    skipPublicInputsValidation: boolean = false,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    const proofAndVk = await this.createAvmProof(inputs);
    await this.verifyAvmProof(proofAndVk.proof.binaryProof, proofAndVk.verificationKey, inputs.publicInputs);

    // TODO(#14234)[Unconditional PIs validation]: remove next lines and directly return proofAndVk
    proofAndVk.proof.proof = enhanceProofWithPiValidationFlag(proofAndVk.proof.proof, skipPublicInputsValidation);
    return proofAndVk;
  }

  public async getPublicTubeProof(
    inputs: PublicTubePrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    const artifactName = 'PublicTube';

    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      artifactName,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPublicTubePrivateInputsToWitnessMap,
      convertPublicTubeOutputsFromWitnessMap,
    );

    const verificationKey = this.getVerificationKeyDataForCircuit(artifactName);

    await this.verifyProof(artifactName, proof.binaryProof);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public getPrivateTxBaseRollupProof(
    inputs: PrivateTxBaseRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      inputs,
      'PrivateTxBaseRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPrivateTxBaseRollupPrivateInputsToWitnessMap,
      convertPrivateTxBaseRollupOutputsFromWitnessMap,
    );
  }

  /**
   * Requests that the public kernel tail circuit be executed and the proof generated
   * @param kernelRequest - The object encapsulating the request for a proof
   * @returns The requested circuit's public inputs and proof
   */
  public getPublicTxBaseRollupProof(
    inputs: PublicTxBaseRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      inputs,
      'PublicTxBaseRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPublicTxBaseRollupPrivateInputsToWitnessMap,
      convertPublicTxBaseRollupOutputsFromWitnessMap,
    );
  }

  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public getTxMergeRollupProof(
    input: TxMergeRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'TxMergeRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertTxMergeRollupPrivateInputsToWitnessMap,
      convertTxMergeRollupOutputsFromWitnessMap,
    );
  }

  public getBlockRootFirstRollupProof(
    input: BlockRootFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockRootFirstRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootFirstRollupPrivateInputsToWitnessMap,
      convertBlockRootFirstRollupOutputsFromWitnessMap,
    );
  }

  public getBlockRootSingleTxFirstRollupProof(
    input: BlockRootSingleTxFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockRootSingleTxFirstRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap,
      convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap,
    );
  }

  public getBlockRootEmptyTxFirstRollupProof(
    input: BlockRootEmptyTxFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockRootEmptyTxFirstRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap,
      convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap,
    );
  }

  public getBlockRootRollupProof(
    input: BlockRootRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockRootRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootRollupPrivateInputsToWitnessMap,
      convertBlockRootRollupOutputsFromWitnessMap,
    );
  }

  public getBlockRootSingleTxRollupProof(
    input: BlockRootSingleTxRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockRootSingleTxRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockRootSingleTxRollupPrivateInputsToWitnessMap,
      convertBlockRootSingleTxRollupOutputsFromWitnessMap,
    );
  }

  public getBlockMergeRollupProof(
    input: BlockMergeRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.createRecursiveProofAndVerify(
      input,
      'BlockMergeRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertBlockMergeRollupPrivateInputsToWitnessMap,
      convertBlockMergeRollupOutputsFromWitnessMap,
    );
  }

  public getCheckpointRootRollupProof(
    input: CheckpointRootRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.createRecursiveProofAndVerify(
      input,
      'CheckpointRootRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertCheckpointRootRollupPrivateInputsToWitnessMap,
      convertCheckpointRootRollupOutputsFromWitnessMap,
    );
  }

  public getCheckpointRootSingleBlockRollupProof(
    input: CheckpointRootSingleBlockRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.createRecursiveProofAndVerify(
      input,
      'CheckpointRootSingleBlockRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap,
      convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap,
    );
  }

  public getCheckpointPaddingRollupProof(
    input: CheckpointPaddingRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.createRecursiveProofAndVerify(
      input,
      'CheckpointPaddingRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertCheckpointPaddingRollupPrivateInputsToWitnessMap,
      convertCheckpointPaddingRollupOutputsFromWitnessMap,
    );
  }

  public getCheckpointMergeRollupProof(
    input: CheckpointMergeRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.createRecursiveProofAndVerify(
      input,
      'CheckpointMergeRollupArtifact',
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertCheckpointMergeRollupPrivateInputsToWitnessMap,
      convertCheckpointMergeRollupOutputsFromWitnessMap,
    );
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(
    input: RootRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    const { proof, ...output } = await this.createRecursiveProofAndVerify(
      input,
      'RootRollupArtifact',
      ULTRA_KECCAK_PROOF_LENGTH,
      convertRootRollupPrivateInputsToWitnessMap,
      convertRootRollupOutputsFromWitnessMap,
    );

    const recursiveProof = makeRecursiveProofFromBinary(proof.binaryProof, NESTED_RECURSIVE_PROOF_LENGTH);
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13188): Remove this hack.
    recursiveProof.binaryProof.numPublicInputs += PAIRING_POINTS_SIZE;

    return { ...output, proof: recursiveProof };
  }

  private async createRecursiveProofAndVerify<
    PROOF_LENGTH extends number,
    CircuitInputType extends { toBuffer: () => Buffer },
    CircuitOutputType extends { toBuffer: () => Buffer },
  >(
    input: CircuitInputType,
    artifactName: ServerProtocolArtifact,
    proofLength: PROOF_LENGTH,
    convertInput: (input: CircuitInputType) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => CircuitOutputType,
  ) {
    const { circuitOutput, proof } = await this.createRecursiveProof(
      input,
      artifactName,
      proofLength,
      convertInput,
      convertOutput,
    );

    await this.verifyProof(artifactName, proof.binaryProof);

    const verificationKey = this.getVerificationKeyDataForCircuit(artifactName);

    return makePublicInputsAndRecursiveProof(circuitOutput, proof, verificationKey);
  }

  /**
   * Generates a proof using bb.js msgpack API - NO FILE I/O for proving!
   * ACVM still writes witness file (different binary), but BB proving happens entirely in memory.
   */
  private async generateProofWithBBMsgpack<
    PROOF_LENGTH extends number,
    Input extends { toBuffer: () => Buffer },
    Output extends { toBuffer: () => Buffer },
  >(
    input: Input,
    circuitType: ServerProtocolArtifact,
    proofLength: PROOF_LENGTH,
    convertInput: (input: Input) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => Output,
    workingDirectory: string,
  ): Promise<{ circuitOutput: Output; proof: RecursiveProof<PROOF_LENGTH>; durationMs: number }> {
    // Still need ACVM for witness generation (different binary)
    const outputWitnessFile = path.join(workingDirectory, 'partial-witness.gz');
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = getServerCircuitArtifact(circuitType);
    logger.debug(`Generating witness data for ${circuitType}`);

    const inputWitness = convertInput(input);
    const foreignCallHandler = undefined;
    const witnessResult = await simulator.executeProtocolCircuit(inputWitness, artifact, foreignCallHandler);
    const output = convertOutput(witnessResult.witness);

    const circuitName = mapProtocolArtifactNameToCircuitName(circuitType);
    this.instrumentation.recordDuration('witGenDuration', circuitName, witnessResult.duration);
    this.instrumentation.recordSize('witGenInputSize', circuitName, input.toBuffer().length);
    this.instrumentation.recordSize('witGenOutputSize', circuitName, output.toBuffer().length);

    logger.info(`Generated witness`, {
      circuitName,
      duration: witnessResult.duration,
      inputSize: input.toBuffer().length,
      outputSize: output.toBuffer().length,
      eventName: 'circuit-witness-generation',
    } satisfies CircuitWitnessGenerationStats);

    // Read witness buffer (last file I/O!)
    const witnessBuffer = await fs.readFile(outputWitnessFile);

    // Get circuit data (already in memory)
    const bytecode = Buffer.from(artifact.bytecode, 'base64');
    const vkData = this.getVerificationKeyDataForCircuit(circuitType);
    const flavor = getUltraHonkFlavorForCircuit(circuitType);

    // Prove via msgpack API - ALL IN MEMORY!
    logger.debug(`Proving ${circuitType} via msgpack API...`);
    const startMs = Date.now();

    const proof = await this.bbMsgpackProver.proveCircuit(
      witnessBuffer,
      bytecode,
      vkData.keyAsBytes,
      circuitName,
      flavor,
      proofLength,
      vkData,
    );

    const durationMs = Date.now() - startMs;

    // Record metrics
    this.instrumentation.recordDuration('provingDuration', circuitName, durationMs);
    this.instrumentation.recordSize('proofSize', circuitName, proof.binaryProof.buffer.length);
    this.instrumentation.recordSize('circuitPublicInputCount', circuitName, vkData.numPublicInputs);
    this.instrumentation.recordSize('circuitSize', circuitName, vkData.circuitSize);

    logger.info(`Generated proof for ${circuitType} in ${Math.ceil(durationMs)} ms, size: ${proof.proof.length} fields`, {
      circuitName,
      circuitSize: vkData.circuitSize,
      duration: durationMs,
      inputSize: output.toBuffer().length,
      proofSize: proof.binaryProof.buffer.length,
      eventName: 'circuit-proving',
      numPublicInputs: vkData.numPublicInputs,
    } satisfies CircuitProvingStats);

    return {
      circuitOutput: output,
      proof,
      durationMs,
    };
  }

  /**
   * Verifies a proof using bb.js msgpack API - NO FILE I/O!
   */
  private async verifyWithKeyMsgpack(
    proof: Proof,
    verificationKey: { keyAsBytes: Buffer },
    flavor: UltraHonkFlavor,
  ): Promise<void> {
    // Verify via msgpack API - ALL IN MEMORY!
    await this.bbMsgpackProver.verifyCircuit(proof, verificationKey.keyAsBytes, flavor);
    logger.debug('Successfully verified proof via msgpack API');
  }

  /**
   * Generates an AVM proof using bb.js msgpack API - NO FILE I/O!
   * All operations happen in memory - no temporary files written.
   */
  private async generateAvmProofMsgpack(
    input: AvmCircuitInputs,
  ): Promise<{ proof: RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>; vk: VerificationKeyData; durationMs: number }> {
    logger.info(`Proving avm-circuit for TX ${input.hints.tx.hash} via msgpack API...`);

    // Serialize inputs to msgpack format
    const inputsBuffer = input.serializeWithMessagePack();

    // Prove via msgpack API - ALL IN MEMORY!
    const startMs = Date.now();

    const result = await this.bbApi.avmProve({
      inputs: inputsBuffer,
    });

    const durationMs = Date.now() - startMs;

    logger.debug(
      `AVM proof generated via msgpack: ${result.proof.length} proof fields, VK size: ${result.verificationKey.length} bytes`,
    );

    // Convert msgpack proof format to Aztec RecursiveProof
    const avmProof = await this.convertAvmProofFromMsgpack(result.proof, result.verificationKey);

    logger.info(`Generated AVM proof for TX ${input.hints.tx.hash} in ${Math.ceil(durationMs)} ms via msgpack API`);

    return {
      proof: avmProof,
      vk: await extractAvmVkData(result.verificationKey),
      durationMs,
    };
  }

  /**
   * Converts AVM proof from msgpack format (raw buffer) to Aztec RecursiveProof format.
   * Similar to readAvmProofAsFields but works with in-memory buffer instead of file.
   */
  private async convertAvmProofFromMsgpack(
    proofBuffer: Uint8Array,
    vkBuffer: Uint8Array,
  ): Promise<RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    const reader = BufferReader.asReader(Buffer.from(proofBuffer));
    const proofFields = reader.readArray(proofBuffer.length / Fr.SIZE_IN_BYTES, Fr);

    // Pad to fixed size (same as readAvmProofAsFields)
    if (proofFields.length > AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) {
      throw new Error(
        `Proof has ${proofFields.length} fields, expected no more than ${AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED}.`,
      );
    }

    const proofFieldsPadded = proofFields.concat(
      Array(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED - proofFields.length).fill(new Fr(0)),
    );

    const proof = new Proof(Buffer.from(proofBuffer), /*numPublicInputs=*/ 0);
    return new RecursiveProof(proofFieldsPadded, proof, true, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
  }

  /**
   * Verifies an AVM proof using bb.js msgpack API - NO FILE I/O!
   */
  private async verifyAvmProofMsgpack(
    proof: Proof,
    verificationKey: VerificationKeyData,
    publicInputs: AvmCircuitPublicInputs,
  ): Promise<void> {
    logger.debug(`Verifying AVM proof via msgpack API...`);

    // Serialize public inputs to msgpack format
    const publicInputsBuffer = publicInputs.serializeWithMessagePack();

    // Verify via msgpack API - ALL IN MEMORY!
    const { verified } = await this.bbApi.avmVerify({
      proof: proof.buffer,
      publicInputs: publicInputsBuffer,
      verificationKey: verificationKey.keyAsBytes,
    });

    if (!verified) {
      throw new Error('AVM proof verification failed via msgpack API');
    }

    logger.debug('AVM proof verified successfully via msgpack API');
  }

  private async createAvmProof(
    input: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    // Use msgpack API - NO FILE I/O!
    const { proof: avmProof, vk: avmVK, durationMs } = await this.generateAvmProofMsgpack(input);

    const circuitType = 'avm-circuit' as const;
    const appCircuitName = 'unknown' as const;
    this.instrumentation.recordAvmDuration('provingDuration', appCircuitName, durationMs);
    this.instrumentation.recordAvmSize('proofSize', appCircuitName, avmProof.binaryProof.buffer.length);

    logger.info(
      `Generated proof for ${circuitType}(${input.hints.tx.hash}) in ${Math.ceil(durationMs)} ms`,
      {
        circuitName: circuitType,
        appCircuitName: input.hints.tx.hash,
        duration: durationMs,
        proofSize: avmProof.binaryProof.buffer.length,
        eventName: 'circuit-proving',
        inputSize: input.serializeWithMessagePack().length,
        circuitSize: 1 << 21,
        numPublicInputs: 0,
      } satisfies CircuitProvingStats,
    );

    return makeProofAndVerificationKey(avmProof, avmVK);
  }

  /**
   * Executes a circuit and returns its outputs and corresponding proof with embedded aggregation object
   * NOW USES MSGPACK API - NO FILE I/O for proving!
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
    // Use msgpack API - eliminates file I/O for proving!
    const operation = async (bbWorkingDirectory: string) => {
      const { proof, circuitOutput: output } = await this.generateProofWithBBMsgpack(
        input,
        circuitType,
        proofLength,
        convertInput,
        convertOutput,
        bbWorkingDirectory,
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
   * NOW USES MSGPACK API - NO FILE I/O!
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProof(circuitType: ServerProtocolArtifact, proof: Proof) {
    const verificationKey = this.getVerificationKeyDataForCircuit(circuitType);
    return await this.verifyWithKey(getUltraHonkFlavorForCircuit(circuitType), verificationKey, proof);
  }

  public async verifyAvmProof(
    proof: Proof,
    verificationKey: VerificationKeyData,
    publicInputs: AvmCircuitPublicInputs,
  ) {
    // Use msgpack API - NO FILE I/O!
    return await this.verifyAvmProofMsgpack(proof, verificationKey, publicInputs);
  }

  public async verifyWithKey(flavor: UltraHonkFlavor, verificationKey: VerificationKeyData, proof: Proof) {
    // Use msgpack API - NO FILE I/O!
    return await this.verifyWithKeyMsgpack(proof, verificationKey, flavor);
  }

  /**
   * Returns the verification key data for a circuit.
   * @param circuitType - The type of circuit for which the verification key is required
   * @returns The verification key data
   */
  private getVerificationKeyDataForCircuit(circuitType: ServerProtocolArtifact): VerificationKeyData {
    const vk = ServerCircuitVks[circuitType];
    if (vk === undefined) {
      throw new Error('Could not find VK for server artifact ' + circuitType);
    }
    return vk;
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
      logger,
    );
  }
}
