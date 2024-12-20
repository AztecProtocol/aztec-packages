import { type PrivateKernelProver, type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  type ClientIvcProof,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  type Proof,
  type VerificationKeyData,
} from '@aztec/circuits.js';
import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
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
import { WASMSimulatorWithBlobs } from '@aztec/simulator';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { encode } from '@msgpack/msgpack';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import { promises as fs } from 'fs';
import path from 'path';

import { BB_RESULT, computeGateCountForCircuit, executeBbClientIvcProof, verifyProof } from '../bb/execute.js';
import { type BBConfig } from '../config.js';
import { type UltraHonkFlavor, getUltraHonkFlavorForCircuit } from '../honk.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
import { extractVkData } from '../verification_key/verification_key_data.js';
import { readFromOutputDirectory } from './client_ivc_proof_utils.js';

/**
 * This proof creator implementation uses the native bb binary.
 * This is a temporary implementation until we make the WASM version work.
 * TODO(#7368): this class grew 'organically' aka it could use a look at its resposibilities
 */
export class BBNativePrivateKernelProver implements PrivateKernelProver {
  private simulator = new WASMSimulatorWithBlobs();

  private verificationKeys: Map<ClientProtocolArtifact, Promise<VerificationKeyData>> = new Map<
    ClientProtocolArtifact,
    Promise<VerificationKeyData>
  >();

  private constructor(
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
    private skipCleanup: boolean,
    private log = createLogger('bb-prover:native'),
  ) {}

  public static async new(config: BBConfig, log?: Logger) {
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
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate client ivc proof`);
      throw new Error(provingResult.reason);
    }

    const proof = await readFromOutputDirectory(directory);

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
    const logFunction = (message: string) => {
      this.log.debug(`$bb gates ${circuitName} - ${message}`);
    };

    const result = await computeGateCountForCircuit(
      this.bbBinaryPath,
      this.bbWorkingDirectory,
      circuitName,
      bytecode,
      'mega_honk',
      logFunction,
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
