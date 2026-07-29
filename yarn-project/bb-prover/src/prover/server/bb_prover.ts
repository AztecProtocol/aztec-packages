import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  PAIRING_POINTS_SIZE,
  RECURSIVE_PROOF_LENGTH,
  ULTRA_KECCAK_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { runInDirectory } from '@aztec/foundation/fs';
import { createLogger } from '@aztec/foundation/log';
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
  convertPublicChonkVerifierOutputsFromWitnessMap,
  convertPublicChonkVerifierPrivateInputsToWitnessMap,
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
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
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
  PublicChonkVerifierPrivateInputs,
  PublicChonkVerifierPublicInputs,
  PublicTxBaseRollupPrivateInputs,
  type RootRollupPrivateInputs,
  type RootRollupPublicInputs,
  type TxMergeRollupPrivateInputs,
  type TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitProvingStats, CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';
import { VerificationKeyData } from '@aztec/stdlib/vks';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { promises as fs } from 'fs';
import { ungzip } from 'pako';
import * as path from 'path';

import { BBJsFactory, type BBJsProofResult } from '../../bb/bb_js_backend.js';
import type { ACVMConfig, BBConfig } from '../../config.js';
import { getUltraHonkFlavorForCircuit } from '../../honk.js';
import { ProverInstrumentation } from '../../instrumentation.js';
import { constructRecursiveProofFromBuffers } from '../proof_utils.js';

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
  private bbJsFactory: BBJsFactory;

  constructor(
    private config: BBProverConfig,
    telemetry: TelemetryClient,
  ) {
    this.instrumentation = new ProverInstrumentation(telemetry, 'BBNativeRollupProver');
    this.bbJsFactory = new BBJsFactory(config.bbBinaryPath, { logger, debugDir: config.bbDebugOutputDir });
  }

  get tracer() {
    return this.instrumentation.tracer;
  }

  static async new(config: BBProverConfig, telemetry: TelemetryClient = getTelemetryClient()) {
    await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
    await fs.access(config.bbBinaryPath, fs.constants.R_OK);
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    logger.info(`Using bb.js API with binary at ${config.bbBinaryPath}`);
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
  public async getAvmProof(inputs: AvmCircuitInputs): Promise<RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS>> {
    const proof = await this.createAvmProof(inputs);
    await this.verifyAvmProof(proof.binaryProof, inputs.publicInputs);
    return proof;
  }

  public async getPublicChonkVerifierProof(
    inputs: PublicChonkVerifierPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<PublicChonkVerifierPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    const artifactName = 'PublicChonkVerifier';

    const { circuitOutput, proof } = await this.createRecursiveProof(
      inputs,
      artifactName,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
      convertPublicChonkVerifierPrivateInputsToWitnessMap,
      convertPublicChonkVerifierOutputsFromWitnessMap,
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
  ): Promise<{ circuitOutput: Output; proofResult: BBJsProofResult }> {
    // Have the ACVM write the partial witness here (still needs a temp directory)
    const outputWitnessFile = path.join(workingDirectory, 'partial-witness.gz');

    // Generate the partial witness using the ACVM
    const simulator = new NativeACVMSimulator(
      this.config.acvmWorkingDirectory,
      this.config.acvmBinaryPath,
      outputWitnessFile,
      logger,
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

    // Read and decompress the witness for bb.js
    const witnessGz = await fs.readFile(outputWitnessFile);
    const witness = ungzip(witnessGz);

    // Decompress bytecode for bb.js
    const bytecode = ungzip(Buffer.from(artifact.bytecode, 'base64'));

    // Prove the circuit via bb.js API
    logger.debug(`Proving ${circuitType} via bb.js...`);

    let proofResult: BBJsProofResult;
    try {
      await using instance = await this.bbJsFactory.getInstance();
      proofResult = await instance.generateProof(
        circuitType,
        bytecode,
        this.getVerificationKeyDataForCircuit(circuitType).keyAsBytes,
        witness,
        getUltraHonkFlavorForCircuit(circuitType),
      );
    } catch (error) {
      // Preserve retryability of the underlying failure (e.g. a transient bb startup error).
      const retry = error instanceof ProvingError && error.retry;
      throw new ProvingError(`Failed to generate proof for ${circuitType}: ${error}`, error, retry);
    }

    return {
      circuitOutput: output,
      proofResult,
    };
  }

  private async createAvmProof(input: AvmCircuitInputs): Promise<RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS>> {
    logger.info(`Proving avm-circuit for TX ${input.hints.tx.hash}...`);

    const inputsBuffer = input.serializeWithMessagePack();
    await using instance = await this.bbJsFactory.getInstance();
    const { proof: proofFieldArrays, durationMs } = await instance.generateAvmProof(inputsBuffer);

    // Convert Uint8Array[] (32-byte field elements) to Fr[]
    const proofFields = proofFieldArrays.map(f => Fr.fromBuffer(Buffer.from(f)));

    if (proofFields.length !== AVM_V2_PROOF_LENGTH_IN_FIELDS) {
      throw new Error(`Proof has ${proofFields.length} fields, expected exactly ${AVM_V2_PROOF_LENGTH_IN_FIELDS}.`);
    }

    // Build the binary proof from the raw field data
    const rawProofBuffer = Buffer.concat(proofFieldArrays.map(f => Buffer.from(f)));
    const binaryProof = new Proof(rawProofBuffer, /*numPublicInputs=*/ 0);
    const avmProof = new RecursiveProof(proofFields, binaryProof, true, AVM_V2_PROOF_LENGTH_IN_FIELDS);

    const circuitType = 'avm-circuit' as const;
    const appCircuitName = 'unknown' as const;
    this.instrumentation.recordAvmDuration('provingDuration', appCircuitName, durationMs);
    this.instrumentation.recordAvmSize('proofSize', appCircuitName, avmProof.binaryProof.buffer.length);

    logger.info(`Generated proof for ${circuitType}(${input.hints.tx.hash}) in ${Math.ceil(durationMs)} ms`, {
      circuitName: circuitType,
      appCircuitName: input.hints.tx.hash,
      duration: durationMs,
      proofSize: avmProof.binaryProof.buffer.length,
      eventName: 'circuit-proving',
      inputSize: inputsBuffer.length,
      circuitSize: 1 << 21,
      numPublicInputs: 0,
    } satisfies CircuitProvingStats);

    return avmProof;
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
    // Still need runInDirectory for ACVM witness generation temp files
    const operation = async (workingDirectory: string) => {
      const { proofResult, circuitOutput: output } = await this.generateProofWithBB(
        input,
        circuitType,
        convertInput,
        convertOutput,
        workingDirectory,
      );

      const vkData = this.getVerificationKeyDataForCircuit(circuitType);
      // Construct proof from in-memory buffers (no file I/O needed)
      const proof = constructRecursiveProofFromBuffers(
        proofResult.proofFields,
        proofResult.publicInputFields,
        vkData,
        proofLength,
      );

      const circuitName = mapProtocolArtifactNameToCircuitName(circuitType);
      this.instrumentation.recordDuration('provingDuration', circuitName, proofResult.durationMs);
      this.instrumentation.recordSize('proofSize', circuitName, proof.binaryProof.buffer.length);
      this.instrumentation.recordSize('circuitPublicInputCount', circuitName, vkData.numPublicInputs);
      this.instrumentation.recordSize('circuitSize', circuitName, vkData.circuitSize);
      logger.info(
        `Generated proof for ${circuitType} in ${Math.ceil(proofResult.durationMs)} ms, size: ${
          proof.proof.length
        } fields`,
        {
          circuitName,
          circuitSize: vkData.circuitSize,
          duration: proofResult.durationMs,
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
   * Verifies a proof via bb.js API (no temp files needed).
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProof(circuitType: ServerProtocolArtifact, proof: Proof) {
    const verificationKey = this.getVerificationKeyDataForCircuit(circuitType);
    const flavor = getUltraHonkFlavorForCircuit(circuitType);

    // Split proof buffer into public input fields and proof fields (32-byte each)
    const publicInputFields = splitBufferToFieldArrays(proof.buffer.subarray(0, proof.numPublicInputs * 32));
    const proofFields = splitBufferToFieldArrays(proof.buffer.subarray(proof.numPublicInputs * 32));

    let verified: boolean;
    let durationMs: number;
    try {
      await using instance = await this.bbJsFactory.getInstance();
      ({ verified, durationMs } = await instance.verifyProof(
        proofFields,
        verificationKey.keyAsBytes,
        publicInputFields,
        flavor,
      ));
    } catch (error) {
      // Preserve retryability of the underlying failure (e.g. a transient bb startup error).
      const retry = error instanceof ProvingError && error.retry;
      throw new ProvingError(`Failed to verify proof for ${circuitType}: ${error}`, error, retry);
    }

    if (!verified) {
      throw new ProvingError('Failed to verify proof from key!');
    }

    logger.info(`Successfully verified proof from key in ${durationMs} ms`);
  }

  /** Verify an AVM proof via bb.js API. */
  public async verifyAvmProof(proof: Proof, publicInputs: AvmCircuitPublicInputs) {
    // For AVM proofs, numPublicInputs is 0, so the full buffer is the proof.
    const proofBuffer = proof.buffer.subarray(proof.numPublicInputs * 32);
    // Split the raw proof buffer into 32-byte field element arrays
    const proofFields: Uint8Array[] = [];
    for (let i = 0; i < proofBuffer.length; i += Fr.SIZE_IN_BYTES) {
      proofFields.push(new Uint8Array(proofBuffer.subarray(i, i + Fr.SIZE_IN_BYTES)));
    }
    const piBuffer = publicInputs.serializeWithMessagePack();

    await using instance = await this.bbJsFactory.getInstance();
    const { verified, durationMs } = await instance.verifyAvmProof(proofFields, piBuffer);

    if (!verified) {
      throw new ProvingError('Failed to verify AVM proof!');
    }

    logger.info(`Successfully verified AVM proof in ${durationMs} ms`);
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

/** Split a buffer into 32-byte Uint8Array field elements. */
function splitBufferToFieldArrays(buffer: Buffer): Uint8Array[] {
  const fields: Uint8Array[] = [];
  for (let i = 0; i < buffer.length; i += 32) {
    fields.push(new Uint8Array(buffer.subarray(i, i + 32)));
  }
  return fields;
}
