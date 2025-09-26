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

import {
  type BBFailure,
  type BBSuccess,
  BB_RESULT,
  PROOF_FILENAME,
  PUBLIC_INPUTS_FILENAME,
  VK_FILENAME,
  generateAvmProof,
  generateProof,
  verifyAvmProof,
  verifyProof,
} from '../../bb/execute.js';
import type { ACVMConfig, BBConfig } from '../../config.js';
import { type UltraHonkFlavor, getUltraHonkFlavorForCircuit } from '../../honk.js';
import { ProverInstrumentation } from '../../instrumentation.js';
import { extractAvmVkData } from '../../verification_key/verification_key_data.js';
import { readProofsFromOutputDirectory } from '../proof_utils.js';

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

    return new BBNativeRollupProver(config, telemetry);
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

  private async generateProofWithBB<
    Input extends { toBuffer: () => Buffer },
    Output extends { toBuffer: () => Buffer },
  >(
    input: Input,
    circuitType: ServerProtocolArtifact,
    convertInput: (input: Input) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => Output,
    workingDirectory: string,
  ): Promise<{ circuitOutput: Output; provingResult: BBSuccess }> {
    // Have the ACVM write the partial witness here
    const outputWitnessFile = path.join(workingDirectory, 'partial-witness.gz');

    // Generate the partial witness using the ACVM
    // A further temp directory will be created beneath ours and then cleaned up after the partial witness has been copied to our specified location
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
    );

    const artifact = getServerCircuitArtifact(circuitType);

    logger.debug(`Generating witness data for ${circuitType}`);

    const inputWitness = convertInput(input);
    const foreignCallHandler = undefined; // We don't handle foreign calls in the native ACVM simulator
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

    // Now prove the circuit from the generated witness
    logger.debug(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      workingDirectory,
      circuitType,
      Buffer.from(artifact.bytecode, 'base64'),
      this.getVerificationKeyDataForCircuit(circuitType).keyAsBytes,
      outputWitnessFile,
      getUltraHonkFlavorForCircuit(circuitType),
      logger,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate proof for ${circuitType}: ${provingResult.reason}`);
      throw new ProvingError(provingResult.reason, provingResult, provingResult.retry);
    }

    return {
      circuitOutput: output,
      provingResult,
    };
  }

  private async generateAvmProofWithBB(input: AvmCircuitInputs, workingDirectory: string): Promise<BBSuccess> {
    logger.info(`Proving avm-circuit for TX ${input.hints.tx.hash}...`);

    const provingResult = await generateAvmProof(this.config.bbBinaryPath, workingDirectory, input, logger);

    if (provingResult.status === BB_RESULT.FAILURE) {
      logger.error(`Failed to generate AVM proof for TX ${input.hints.tx.hash}: ${provingResult.reason}`);
      throw new ProvingError(provingResult.reason, provingResult, provingResult.retry);
    }

    return provingResult;
  }

  private async createAvmProof(
    input: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    const operation = async (bbWorkingDirectory: string) => {
      const provingResult = await this.generateAvmProofWithBB(input, bbWorkingDirectory);

      const avmVK = await extractAvmVkData(provingResult.vkDirectoryPath!);
      const avmProof = await this.readAvmProofAsFields(provingResult.proofPath!);

      const circuitType = 'avm-circuit' as const;
      const appCircuitName = 'unknown' as const;
      this.instrumentation.recordAvmDuration('provingDuration', appCircuitName, provingResult.durationMs);
      this.instrumentation.recordAvmSize('proofSize', appCircuitName, avmProof.binaryProof.buffer.length);

      logger.info(
        `Generated proof for ${circuitType}(${input.hints.tx.hash}) in ${Math.ceil(provingResult.durationMs)} ms`,
        {
          circuitName: circuitType,
          appCircuitName: input.hints.tx.hash,
          // does not include reading the proof from disk
          duration: provingResult.durationMs,
          proofSize: avmProof.binaryProof.buffer.length,
          eventName: 'circuit-proving',
          inputSize: input.serializeWithMessagePack().length,
          circuitSize: 1 << 21,
          numPublicInputs: 0,
        } satisfies CircuitProvingStats,
      );

      return makeProofAndVerificationKey(avmProof, avmVK);
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
      const { provingResult, circuitOutput: output } = await this.generateProofWithBB(
        input,
        circuitType,
        convertInput,
        convertOutput,
        bbWorkingDirectory,
      );

      const vkData = this.getVerificationKeyDataForCircuit(circuitType);
      // Read the proof as fields
      const proof = await readProofsFromOutputDirectory(provingResult.proofPath!, vkData, proofLength, logger);

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
    const verificationKey = this.getVerificationKeyDataForCircuit(circuitType);
    return await this.verifyWithKey(getUltraHonkFlavorForCircuit(circuitType), verificationKey, proof);
  }

  public async verifyAvmProof(
    proof: Proof,
    verificationKey: VerificationKeyData,
    publicInputs: AvmCircuitPublicInputs,
  ) {
    return await this.verifyWithKeyInternal(proof, verificationKey, (proofPath, vkPath) =>
      verifyAvmProof(this.config.bbBinaryPath, this.config.bbWorkingDirectory, proofPath, publicInputs, vkPath, logger),
    );
  }

  public async verifyWithKey(flavor: UltraHonkFlavor, verificationKey: VerificationKeyData, proof: Proof) {
    return await this.verifyWithKeyInternal(proof, verificationKey, (proofPath, vkPath) =>
      verifyProof(this.config.bbBinaryPath, proofPath, vkPath, flavor, logger),
    );
  }

  private async verifyWithKeyInternal(
    proof: Proof,
    verificationKey: { keyAsBytes: Buffer },
    verificationFunction: (proofPath: string, vkPath: string) => Promise<BBFailure | BBSuccess>,
  ) {
    const operation = async (bbWorkingDirectory: string) => {
      const publicInputsFileName = path.join(bbWorkingDirectory, PUBLIC_INPUTS_FILENAME);
      const proofFileName = path.join(bbWorkingDirectory, PROOF_FILENAME);
      const verificationKeyPath = path.join(bbWorkingDirectory, VK_FILENAME);
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13189): Put this proof parsing logic in the proof class.
      await fs.writeFile(publicInputsFileName, proof.buffer.slice(0, proof.numPublicInputs * 32));
      await fs.writeFile(proofFileName, proof.buffer.slice(proof.numPublicInputs * 32));
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

  private async readAvmProofAsFields(
    proofFilename: string,
  ): Promise<RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    const rawProofBuffer = await fs.readFile(proofFilename);
    const reader = BufferReader.asReader(rawProofBuffer);
    const proofFields = reader.readArray(rawProofBuffer.length / Fr.SIZE_IN_BYTES, Fr);

    // We extend to a fixed-size padded proof as during development any new AVM circuit column changes the
    // proof length and we do not have a mechanism to feedback a cpp constant to noir/TS.
    // TODO(#13390): Revive a non-padded AVM proof
    if (proofFields.length > AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) {
      throw new Error(
        `Proof has ${proofFields.length} fields, expected no more than ${AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED}.`,
      );
    }
    const proofFieldsPadded = proofFields.concat(
      Array(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED - proofFields.length).fill(new Fr(0)),
    );

    const proof = new Proof(rawProofBuffer, /*numPublicInputs=*/ 0);
    return new RecursiveProof(proofFieldsPadded, proof, true, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
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
