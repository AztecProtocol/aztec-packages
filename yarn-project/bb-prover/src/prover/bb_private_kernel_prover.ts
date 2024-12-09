import {
  type AppCircuitSimulateOutput,
  type PrivateKernelProver,
  type PrivateKernelSimulateOutput,
} from '@aztec/circuit-types';
import { type CircuitSimulationStats, type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  AGGREGATION_OBJECT_LENGTH,
  ClientIvcProof,
  Fr,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  Proof,
  RecursiveProof,
  type VerificationKeyAsFields,
  type VerificationKeyData,
} from '@aztec/circuits.js';
import { runInDirectory } from '@aztec/foundation/fs';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import {
  ClientCircuitArtifacts,
  ClientCircuitVks,
  type ClientProtocolArtifact,
  ProtocolCircuitVks,
  convertPrivateKernelInitInputsToWitnessMap,
  convertPrivateKernelInitOutputsFromWitnessMap,
  convertPrivateKernelInnerInputsToWitnessMap,
  convertPrivateKernelInnerOutputsFromWitnessMap,
  convertPrivateKernelResetInputsToWitnessMap,
  convertPrivateKernelResetOutputsFromWitnessMap,
  convertPrivateKernelTailForPublicOutputsFromWitnessMap,
  convertPrivateKernelTailInputsToWitnessMap,
  convertPrivateKernelTailOutputsFromWitnessMap,
  convertPrivateKernelTailToPublicInputsToWitnessMap,
  getPrivateKernelResetArtifactName,
} from '@aztec/noir-protocol-circuits-types';
import { WASMSimulator } from '@aztec/simulator';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { encode } from '@msgpack/msgpack';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import * as fs from 'fs/promises';
import path from 'path';

import {
  BB_RESULT,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  computeGateCountForCircuit,
  computeVerificationKey,
  executeBbClientIvcProof,
  verifyProof,
} from '../bb/execute.js';
import { type BBConfig } from '../config.js';
import { type UltraHonkFlavor, getUltraHonkFlavorForCircuit } from '../honk.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
import { extractVkData } from '../verification_key/verification_key_data.js';

/**
 * This proof creator implementation uses the native bb binary.
 * This is a temporary implementation until we make the WASM version work.
 * TODO(#7368): this class grew 'organically' aka it could use a look at its resposibilities
 */
export class BBNativePrivateKernelProver implements PrivateKernelProver {
  private simulator = new WASMSimulator();

  private verificationKeys: Map<ClientProtocolArtifact, Promise<VerificationKeyData>> = new Map<
    ClientProtocolArtifact,
    Promise<VerificationKeyData>
  >();

  private constructor(
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
    private skipCleanup: boolean,
    private log = createDebugLogger('aztec:bb-native-prover'),
  ) {}

  public static async new(config: BBConfig, log?: DebugLogger) {
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    return new BBNativePrivateKernelProver(config.bbBinaryPath, config.bbWorkingDirectory, !!config.bbSkipCleanup, log);
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
      true,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate client ivc proof`);
      throw new Error(provingResult.reason);
    }

    const proof = await ClientIvcProof.readFromOutputDirectory(directory);

    this.log.info(`Generated IVC proof`, {
      duration: provingResult.durationMs,
      eventName: 'circuit-proving',
    });

    return proof;
  }

  async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    this.log.info(`Generating Client IVC proof`);
    const operation = async (directory: string) => {
      return await this._createClientIvcProof(directory, acirs, witnessStack);
    };
    return await this.runInDirectory(operation);
  }

  public async simulateProofInit(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.simulate(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMap,
      convertPrivateKernelInitOutputsFromWitnessMap,
    );
  }

  public async simulateProofInner(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.simulate(
      inputs,
      'PrivateKernelInnerArtifact',
      convertPrivateKernelInnerInputsToWitnessMap,
      convertPrivateKernelInnerOutputsFromWitnessMap,
    );
  }

  public async simulateProofReset(
    inputs: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const variantInputs = inputs.trimToSizes();
    const artifactName = getPrivateKernelResetArtifactName(inputs.dimensions);
    return await this.simulate(
      variantInputs,
      artifactName,
      variantInputs => convertPrivateKernelResetInputsToWitnessMap(variantInputs, artifactName),
      output => convertPrivateKernelResetOutputsFromWitnessMap(output, artifactName),
    );
  }

  public async simulateProofTail(
    inputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    if (!inputs.isForPublic()) {
      return await this.simulate(
        inputs,
        'PrivateKernelTailArtifact',
        convertPrivateKernelTailInputsToWitnessMap,
        convertPrivateKernelTailOutputsFromWitnessMap,
      );
    }
    return await this.simulate(
      inputs,
      'PrivateKernelTailToPublicArtifact',
      convertPrivateKernelTailToPublicInputsToWitnessMap,
      convertPrivateKernelTailForPublicOutputsFromWitnessMap,
    );
  }

  public async computeAppCircuitVerificationKey(
    bytecode: Buffer,
    appCircuitName?: string,
  ): Promise<AppCircuitSimulateOutput> {
    const operation = async (directory: string) => {
      this.log.debug(`Proving app circuit`);
      // App circuits are always recursive; the #[recursive] attribute used to be applied automatically
      // by the `private` comptime macro in noir-projects/aztec-nr/aztec/src/macros/functions/mod.nr
      // Yet, inside `computeVerificationKey` the `mega_honk` flavor is used, which doesn't use the recursive flag.
      const recursive = true;
      return await this.computeVerificationKey(directory, bytecode, recursive, 'App', appCircuitName);
    };

    return await this.runInDirectory(operation);
  }

  /**
   * Verifies a proof, will generate the verification key if one is not cached internally
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProofForProtocolCircuit(circuitType: ClientProtocolArtifact, proof: Proof) {
    const verificationKey = ProtocolCircuitVks[circuitType];

    this.log.debug(`Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

    const logFunction = (message: string) => {
      this.log.debug(`${circuitType} BB out - ${message}`);
    };

    const result = await this.verifyProofFromKey(
      getUltraHonkFlavorForCircuit(circuitType),
      verificationKey.keyAsBytes,
      proof,
      logFunction,
    );

    if (result.status === BB_RESULT.FAILURE) {
      const errorMessage = `Failed to verify ${circuitType} proof!`;
      throw new Error(errorMessage);
    }

    this.log.info(`Successfully verified ${circuitType} proof in ${Math.ceil(result.durationMs)} ms`);
  }

  public async computeGateCountForCircuit(bytecode: Buffer, circuitName: string): Promise<number> {
    const result = await computeGateCountForCircuit(
      this.bbBinaryPath,
      this.bbWorkingDirectory,
      circuitName,
      bytecode,
      'mega_honk',
    );
    if (result.status === BB_RESULT.FAILURE) {
      throw new Error(result.reason);
    }

    return result.circuitSize as number;
  }

  private async verifyProofFromKey(
    flavor: UltraHonkFlavor,
    verificationKey: Buffer,
    proof: Proof,
    logFunction: (message: string) => void = () => {},
  ) {
    const operation = async (bbWorkingDirectory: string) => {
      const proofFileName = `${bbWorkingDirectory}/proof`;
      const verificationKeyPath = `${bbWorkingDirectory}/vk`;

      await fs.writeFile(proofFileName, proof.buffer);
      await fs.writeFile(verificationKeyPath, verificationKey);
      return await verifyProof(this.bbBinaryPath, proofFileName, verificationKeyPath!, flavor, logFunction);
    };
    return await this.runInDirectory(operation);
  }

  /**
   * Ensures our verification key cache includes the key data located at the specified directory
   * @param filePath - The directory containing the verification key data files
   * @param circuitType - The type of circuit to which the verification key corresponds
   */
  private async updateVerificationKeyAfterSimulation(filePath: string, circuitType: ClientProtocolArtifact) {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      promise = extractVkData(filePath);
      this.log.debug(`Updated verification key for circuit: ${circuitType}`);
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  private async simulate<
    I extends { toBuffer: () => Buffer },
    O extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
  >(
    inputs: I,
    circuitType: ClientProtocolArtifact,
    convertInputs: (inputs: I) => WitnessMap,
    convertOutputs: (outputs: WitnessMap) => O,
  ): Promise<PrivateKernelSimulateOutput<O>> {
    this.log.debug(`Generating witness for ${circuitType}`);
    const compiledCircuit: NoirCompiledCircuit = ClientCircuitArtifacts[circuitType];

    const witnessMap = convertInputs(inputs);
    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = convertOutputs(outputWitness);

    this.log.debug(`Generated witness for ${circuitType}`, {
      eventName: 'circuit-witness-generation',
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: timer.ms(),
      inputSize: inputs.toBuffer().length,
      outputSize: output.toBuffer().length,
    } satisfies CircuitWitnessGenerationStats);

    const verificationKey = ClientCircuitVks[circuitType].keyAsFields;
    const bytecode = Buffer.from(compiledCircuit.bytecode, 'base64');

    const kernelOutput: PrivateKernelSimulateOutput<O> = {
      publicInputs: output,
      verificationKey,
      outputWitness,
      bytecode,
    };
    return kernelOutput;
  }

  private async computeVerificationKey(
    directory: string,
    bytecode: Buffer,
    recursive: boolean,
    circuitType: ClientProtocolArtifact | 'App',
    appCircuitName?: string,
  ): Promise<{
    verificationKey: VerificationKeyAsFields;
  }> {
    const dbgCircuitName = appCircuitName ? `(${appCircuitName})` : '';
    this.log.info(`Computing VK of ${circuitType}${dbgCircuitName} circuit...`);

    const timer = new Timer();

    const vkResult = await computeVerificationKey(
      this.bbBinaryPath,
      directory,
      circuitType,
      bytecode,
      recursive,
      circuitType === 'App' ? 'mega_honk' : getUltraHonkFlavorForCircuit(circuitType),
      this.log.debug,
    );

    if (vkResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate verification key for ${circuitType}${dbgCircuitName}: ${vkResult.reason}`);
      throw new Error(vkResult.reason);
    }

    this.log.info(`Generated ${circuitType}${dbgCircuitName} VK in ${Math.ceil(timer.ms())} ms`);

    if (circuitType === 'App') {
      const vkData = await extractVkData(directory);

      this.log.debug(`Computed verification key`, {
        circuitName: 'app-circuit',
        duration: vkResult.durationMs,
        eventName: 'circuit-simulation',
        inputSize: bytecode.length,
        outputSize: vkData.keyAsBytes.length,
        circuitSize: vkData.circuitSize,
        numPublicInputs: vkData.numPublicInputs,
      } as CircuitSimulationStats);

      return { verificationKey: vkData.keyAsFields };
    }

    const vkData = await this.updateVerificationKeyAfterSimulation(directory, circuitType);

    this.log.debug(`Computed verification key`, {
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: vkResult.durationMs,
      eventName: 'circuit-simulation',
      inputSize: bytecode.length,
      outputSize: vkData.keyAsBytes.length,
      circuitSize: vkData.circuitSize,
      numPublicInputs: vkData.numPublicInputs,
    } as CircuitSimulationStats);

    return { verificationKey: vkData.keyAsFields };
  }

  /**
   * Parses and returns the proof data stored at the specified directory
   * @param filePath - The directory containing the proof data
   * @param circuitType - The type of circuit proven
   * @returns The proof
   */
  private async readProofAsFields<PROOF_LENGTH extends number>(
    filePath: string,
    circuitType: ClientProtocolArtifact | 'App',
    vkData: VerificationKeyData,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    const [binaryProof, proofString] = await Promise.all([
      fs.readFile(`${filePath}/${PROOF_FILENAME}`),
      fs.readFile(`${filePath}/${PROOF_FIELDS_FILENAME}`, { encoding: 'utf-8' }),
    ]);
    const json = JSON.parse(proofString);
    const fields = json.map(Fr.fromString);
    const numPublicInputs = vkData.numPublicInputs - AGGREGATION_OBJECT_LENGTH;
    const fieldsWithoutPublicInputs = fields.slice(numPublicInputs);
    this.log.info(
      `Circuit type: ${circuitType}, complete proof length: ${fields.length}, without public inputs: ${fieldsWithoutPublicInputs.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}, is recursive: ${vkData.isRecursive}, raw length: ${binaryProof.length}`,
    );
    const proof = new RecursiveProof<PROOF_LENGTH>(
      fieldsWithoutPublicInputs,
      new Proof(binaryProof, vkData.numPublicInputs),
      true,
      fieldsWithoutPublicInputs.length,
    );
    return proof;
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
