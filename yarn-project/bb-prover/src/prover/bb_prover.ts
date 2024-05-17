/* eslint-disable require-await */
import {
  type PublicInputsAndProof,
  type PublicKernelNonTailRequest,
  type PublicKernelTailRequest,
  PublicKernelType,
  type ServerCircuitProver,
  makePublicInputsAndProof,
} from '@aztec/circuit-types';
import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  Fr,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type ParityPublicInputs,
  Proof,
  type PublicKernelCircuitPublicInputs,
  type RECURSIVE_PROOF_LENGTH,
  RecursiveProof,
  RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type VerificationKeyAsFields,
  type VerificationKeyData,
  makeRecursiveProofFromBinary,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
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

import {
  BB_RESULT,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  generateKeyForNoirCircuit,
  generateProof,
  verifyProof,
  writeProofAsFields,
} from '../bb/execute.js';
import { PublicKernelArtifactMapping } from '../mappings/mappings.js';
import { circuitTypeToCircuitName, emitCircuitProvingStats, emitCircuitWitnessGenerationStats } from '../stats.js';
import {
  AGGREGATION_OBJECT_SIZE,
  extractVkData,
  getNumPublicInputsFromVKFields,
} from '../verification_key/verification_key_data.js';

const logger = createDebugLogger('aztec:bb-prover');

const CIRCUITS_WITHOUT_AGGREGATION: Set<ServerProtocolArtifact> = new Set(['BaseParityArtifact']);

export type BBProverConfig = {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  acvmBinaryPath: string;
  acvmWorkingDirectory: string;
  // list of circuits supported by this prover. defaults to all circuits if empty
  circuitFilter?: ServerProtocolArtifact[];
};

/**
 * Prover implementation that uses barretenberg native proving
 */
export class BBNativeRollupProver implements ServerCircuitProver {
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

    return new BBNativeRollupProver(config);
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getBaseParityProof(inputs: BaseParityInputs): Promise<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>> {
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    const [circuitOutput, proof] = await this.createRecursiveProof<typeof RECURSIVE_PROOF_LENGTH, ParityPublicInputs>(
      witnessMap,
      'BaseParityArtifact',
      convertBaseParityOutputsFromWitnessMap,
    );

    const verificationKey = await this.getVerificationKeyDataForCircuit('BaseParityArtifact');

    return new RootParityInput(proof, verificationKey.keyAsFields, circuitOutput);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getRootParityProof(
    inputs: RootParityInputs,
  ): Promise<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    const [circuitOutput, proof] = await this.createRecursiveProof<
      typeof NESTED_RECURSIVE_PROOF_LENGTH,
      ParityPublicInputs
    >(witnessMap, 'RootParityArtifact', convertRootParityOutputsFromWitnessMap);

    const verificationKey = await this.getVerificationKeyDataForCircuit('RootParityArtifact');

    return new RootParityInput(proof, verificationKey.keyAsFields, circuitOutput);
  }

  /**
   * Requests that a public kernel circuit be executed and the proof generated
   * @param kernelRequest - The object encapsulating the request for a proof
   * @returns The requested circuit's public inputs and proof
   */
  public async getPublicKernelProof(
    kernelRequest: PublicKernelNonTailRequest,
  ): Promise<PublicInputsAndProof<PublicKernelCircuitPublicInputs>> {
    const kernelOps = PublicKernelArtifactMapping[kernelRequest.type];
    if (kernelOps === undefined) {
      throw new Error(`Unable to prove kernel type ${PublicKernelType[kernelRequest.type]}`);
    }
    const witnessMap = kernelOps.convertInputs(kernelRequest.inputs);

    const [circuitOutput, proof] = await this.createRecursiveProof<
      typeof NESTED_RECURSIVE_PROOF_LENGTH,
      PublicKernelCircuitPublicInputs
    >(witnessMap, kernelOps.artifact, kernelOps.convertOutputs);

    const verificationKey = await this.getVerificationKeyDataForCircuit(kernelOps.artifact);

    return makePublicInputsAndProof(circuitOutput, proof, verificationKey.keyAsFields);
  }

  /**
   * Requests that the public kernel tail circuit be executed and the proof generated
   * @param kernelRequest - The object encapsulating the request for a proof
   * @returns The requested circuit's public inputs and proof
   */
  public async getPublicTailProof(
    kernelRequest: PublicKernelTailRequest,
  ): Promise<PublicInputsAndProof<KernelCircuitPublicInputs>> {
    const witnessMap = convertPublicTailInputsToWitnessMap(kernelRequest.inputs);

    const [circuitOutput, proof] = await this.createRecursiveProof<
      typeof NESTED_RECURSIVE_PROOF_LENGTH,
      KernelCircuitPublicInputs
    >(witnessMap, 'PublicKernelTailArtifact', convertPublicTailOutputFromWitnessMap);

    const verificationKey = await this.getVerificationKeyDataForCircuit('PublicKernelTailArtifact');

    return makePublicInputsAndProof(circuitOutput, proof, verificationKey.keyAsFields);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBaseRollupProof(
    input: BaseRollupInputs,
  ): Promise<PublicInputsAndProof<BaseOrMergeRollupPublicInputs>> {
    input.kernelData.proof = await this.ensureValidProof(
      input.kernelData.proof,
      'BaseRollupArtifact',
      input.kernelData.vk,
    );
    const witnessMap = convertBaseRollupInputsToWitnessMap(input);

    const [circuitOutput, proof] = await this.createRecursiveProof<
      typeof NESTED_RECURSIVE_PROOF_LENGTH,
      BaseOrMergeRollupPublicInputs
    >(witnessMap, 'BaseRollupArtifact', convertBaseRollupOutputsFromWitnessMap);

    const verificationKey = await this.getVerificationKeyDataForCircuit('BaseRollupArtifact');

    return makePublicInputsAndProof(circuitOutput, proof, verificationKey.keyAsFields);
  }
  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getMergeRollupProof(
    input: MergeRollupInputs,
  ): Promise<PublicInputsAndProof<BaseOrMergeRollupPublicInputs>> {
    const witnessMap = convertMergeRollupInputsToWitnessMap(input);

    const [circuitOutput, proof] = await this.createRecursiveProof<
      typeof NESTED_RECURSIVE_PROOF_LENGTH,
      BaseOrMergeRollupPublicInputs
    >(witnessMap, 'MergeRollupArtifact', convertMergeRollupOutputsFromWitnessMap);

    const verificationKey = await this.getVerificationKeyDataForCircuit('MergeRollupArtifact');

    return makePublicInputsAndProof(circuitOutput, proof, verificationKey.keyAsFields);
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(input: RootRollupInputs): Promise<PublicInputsAndProof<RootRollupPublicInputs>> {
    const witnessMap = convertRootRollupInputsToWitnessMap(input);

    const [outputWitness, proof] = await this.createProof(witnessMap, 'RootRollupArtifact');

    await this.verifyProof('RootRollupArtifact', proof);

    const result = convertRootRollupOutputsFromWitnessMap(outputWitness);

    const recursiveProof = makeRecursiveProofFromBinary(proof, NESTED_RECURSIVE_PROOF_LENGTH);

    const verificationKey = await this.getVerificationKeyDataForCircuit('RootRollupArtifact');

    return makePublicInputsAndProof(result, recursiveProof, verificationKey.keyAsFields);
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

    const timer = new Timer();
    const outputWitness = await simulator.simulateCircuit(witnessMap, artifact);
    emitCircuitWitnessGenerationStats(
      circuitTypeToCircuitName(circuitType),
      timer.ms(),
      witnessMap.size * Fr.SIZE_IN_BYTES,
      outputWitness.size * Fr.SIZE_IN_BYTES,
      logger,
    );

    // Now prove the circuit from the generated witness
    logger.debug(`Proving ${circuitType}...`);

    const provingResult = await generateProof(
      this.config.bbBinaryPath,
      bbWorkingDirectory,
      circuitType,
      Buffer.from(artifact.bytecode, 'base64'),
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
    const proof = await fs.readFile(`${provingResult.proofPath!}/${PROOF_FILENAME}`);

    // does not include reading the proof from disk above because duration comes from the bb wrapper
    emitCircuitProvingStats(
      circuitTypeToCircuitName(circuitType),
      provingResult.duration,
      witnessMap.size * Fr.SIZE_IN_BYTES,
      outputWitness.size * Fr.SIZE_IN_BYTES,
      proof.length,
      logger,
    );

    await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    logger.info(`Generated proof for ${circuitType} in ${provingResult.duration} ms, size: ${proof.length} fields`);

    return [outputWitness, new Proof(proof)];
  }

  /**
   * Executes a circuit and returns it's outputs and corresponding proof with embedded aggregation object
   * @param witnessMap - The input witness
   * @param circuitType - The type of circuit to be executed
   * @param convertOutput - Function for parsing the output witness to it's corresponding object
   * @returns The circuits output object and it's proof
   */
  public async createRecursiveProof<PROOF_LENGTH extends number, CircuitOutputType>(
    witnessMap: WitnessMap,
    circuitType: ServerProtocolArtifact,
    convertOutput: (outputWitness: WitnessMap) => CircuitOutputType,
  ): Promise<[CircuitOutputType, RecursiveProof<PROOF_LENGTH>]> {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    await fs.access(bbWorkingDirectory);

    try {
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

      const timer = new Timer();
      const outputWitness = await simulator.simulateCircuit(witnessMap, artifact);

      emitCircuitWitnessGenerationStats(
        circuitTypeToCircuitName(circuitType),
        timer.ms(),
        witnessMap.size * Fr.SIZE_IN_BYTES,
        outputWitness.size * Fr.SIZE_IN_BYTES,
        logger,
      );

      const outputType = convertOutput(outputWitness);

      // Now prove the circuit from the generated witness
      logger.debug(`Proving ${circuitType}...`);

      const provingResult = await generateProof(
        this.config.bbBinaryPath,
        bbWorkingDirectory,
        circuitType,
        Buffer.from(artifact.bytecode, 'base64'),
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

      logger.info(
        `Generated proof for ${circuitType} in ${provingResult.duration} ms, size: ${proof.proof.length} fields`,
      );

      emitCircuitProvingStats(
        circuitTypeToCircuitName(circuitType),
        provingResult.duration,
        witnessMap.size * Fr.SIZE_IN_BYTES,
        outputWitness.size * Fr.SIZE_IN_BYTES,
        proof.binaryProof.buffer.length,
        logger,
      );

      return [outputType, proof];
    } finally {
      await fs.rm(bbWorkingDirectory, { recursive: true, force: true });
    }
  }

  /**
   * Verifies a proof, will generate the verification key if one is not cached internally
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProof(circuitType: ServerProtocolArtifact, proof: Proof) {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    const proofFileName = `${bbWorkingDirectory}/proof`;
    const verificationKeyPath = `${bbWorkingDirectory}/vk`;
    const verificationKey = await this.getVerificationKeyDataForCircuit(circuitType);

    logger.debug(`Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

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
    proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    circuit: ServerProtocolArtifact,
    vk: VerificationKeyData,
  ) {
    const numPublicInputs = vk.numPublicInputs - AGGREGATION_OBJECT_SIZE;
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    try {
      await fs.mkdir(bbWorkingDirectory, { recursive: true });
      const proofFullFilename = `${bbWorkingDirectory}/${PROOF_FILENAME}`;
      const vkFullFilename = `${bbWorkingDirectory}/vk`;

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
        throw new Error(errorMessage);
      }

      const proofString = await fs.readFile(`${bbWorkingDirectory}/${PROOF_FIELDS_FILENAME}`, { encoding: 'utf-8' });
      const json = JSON.parse(proofString);
      const fields = json.slice(numPublicInputs).map(Fr.fromString);
      return new RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>(
        fields,
        new Proof(proof.binaryProof.buffer),
        true,
      );
    } finally {
      //await fs.rm(bbWorkingDirectory, { recursive: true, force: true });
    }
  }

  /**
   * Returns the verification key data for a circuit, will generate and cache it if not cached internally
   * @param circuitType - The type of circuit for which the verification key is required
   * @returns The verification key data
   */
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
        return extractVkData(result.vkPath!);
      });
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  /**
   * Ensures our verification key cache includes the key data located at the specified directory
   * @param filePath - The directory containing the verification key data files
   * @param circuitType - The type of circuit to which the verification key corresponds
   */
  private async updateVerificationKeyAfterProof(filePath: string, circuitType: ServerProtocolArtifact) {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      promise = extractVkData(filePath);
      this.verificationKeys.set(circuitType, promise);
    }
    await promise;
  }

  /**
   * Parses and returns the proof data stored at the specified directory
   * @param filePath - The directory containing the proof data
   * @param circuitType - The type of circuit proven
   * @returns The proof
   */
  private async readProofAsFields<PROOF_LENGTH extends number>(
    filePath: string,
    circuitType: ServerProtocolArtifact,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    const [binaryProof, proofString] = await Promise.all([
      fs.readFile(`${filePath}/${PROOF_FILENAME}`),
      fs.readFile(`${filePath}/${PROOF_FIELDS_FILENAME}`, { encoding: 'utf-8' }),
    ]);
    const json = JSON.parse(proofString);
    const vkData = await this.verificationKeys.get(circuitType);
    if (!vkData) {
      throw new Error(`Invalid verification key for ${circuitType}`);
    }
    const numPublicInputs = CIRCUITS_WITHOUT_AGGREGATION.has(circuitType)
      ? vkData.numPublicInputs
      : vkData.numPublicInputs - AGGREGATION_OBJECT_SIZE;
    const fieldsWithoutPublicInputs = json.slice(numPublicInputs).map(Fr.fromString);
    logger.debug(
      `Circuit type: ${circuitType}, complete proof length: ${json.length}, without public inputs: ${fieldsWithoutPublicInputs.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}, is recursive: ${vkData.isRecursive}, raw length: ${binaryProof.length}`,
    );
    const proof = new RecursiveProof<PROOF_LENGTH>(fieldsWithoutPublicInputs, new Proof(binaryProof), true);
    return proof;
  }
}
