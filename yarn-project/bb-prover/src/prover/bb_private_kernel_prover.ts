import { type PrivateKernelProver, type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
import { type CircuitSimulationStats, type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  type ClientIvcProof,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js';
import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer, elapsed } from '@aztec/foundation/timer';
import {
  ClientCircuitArtifacts,
  type ClientProtocolArtifact,
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
  executeInit,
  executeInner,
  executeReset,
  executeTail,
  executeTailForPublic,
  getPrivateKernelResetArtifactName,
  maxPrivateKernelResetDimensions,
} from '@aztec/noir-protocol-circuits-types/client/bundle';
import { ClientCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { WASMSimulatorWithBlobs } from '@aztec/simulator';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { encode } from '@msgpack/msgpack';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import { promises as fs } from 'fs';
import path from 'path';

import { BB_RESULT, computeGateCountForCircuit, executeBbClientIvcProof } from '../bb/execute.js';
import { type BBConfig } from '../config.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
import { readFromOutputDirectory } from './client_ivc_proof_utils.js';

/**
 * This proof creator implementation uses the native bb binary.
 * This is a temporary implementation until we make the WASM version work.
 * TODO(#7368): this class grew 'organically' aka it could use a look at its resposibilities
 */
export class BBNativePrivateKernelProver implements PrivateKernelProver {
  private simulator = new WASMSimulatorWithBlobs();

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

  public async generateInitOutput(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMap,
      convertPrivateKernelInitOutputsFromWitnessMap,
    );
  }

  public async simulateInit(
    privateInputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const [duration, result] = await elapsed(() => executeInit(privateInputs));
    this.log.debug(`Simulated private kernel init`, {
      eventName: 'circuit-simulation',
      circuitName: 'private-kernel-init',
      duration,
      inputSize: privateInputs.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return this.makeEmptyKernelSimulateOutput<PrivateKernelCircuitPublicInputs>(result, 'PrivateKernelInitArtifact');
  }

  public async generateInnerOutput(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelInnerArtifact',
      convertPrivateKernelInnerInputsToWitnessMap,
      convertPrivateKernelInnerOutputsFromWitnessMap,
    );
  }

  public async simulateInner(
    privateInputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const [duration, result] = await elapsed(() => executeInner(privateInputs));
    this.log.debug(`Simulated private kernel inner`, {
      eventName: 'circuit-simulation',
      circuitName: 'private-kernel-inner',
      duration,
      inputSize: privateInputs.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return this.makeEmptyKernelSimulateOutput<PrivateKernelCircuitPublicInputs>(result, 'PrivateKernelInnerArtifact');
  }

  public async generateResetOutput(
    inputs: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const variantInputs = inputs.trimToSizes();
    const artifactName = getPrivateKernelResetArtifactName(inputs.dimensions);
    return await this.generateCircuitOutput(
      variantInputs,
      artifactName,
      variantInputs => convertPrivateKernelResetInputsToWitnessMap(variantInputs, artifactName),
      output => convertPrivateKernelResetOutputsFromWitnessMap(output, artifactName),
    );
  }

  public async simulateReset(
    privateInputs: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const variantPrivateInputs = privateInputs.trimToSizes();
    const [duration, result] = await elapsed(() =>
      executeReset(variantPrivateInputs, privateInputs.dimensions, privateInputs),
    );
    this.log.debug(`Simulated private kernel reset`, {
      eventName: 'circuit-simulation',
      circuitName: 'private-kernel-reset',
      duration,
      inputSize: variantPrivateInputs.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return this.makeEmptyKernelSimulateOutput<PrivateKernelCircuitPublicInputs>(
      result,
      getPrivateKernelResetArtifactName(maxPrivateKernelResetDimensions),
    );
  }

  public async generateTailOutput(
    inputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    if (!inputs.isForPublic()) {
      return await this.generateCircuitOutput(
        inputs,
        'PrivateKernelTailArtifact',
        convertPrivateKernelTailInputsToWitnessMap,
        convertPrivateKernelTailOutputsFromWitnessMap,
      );
    }
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelTailToPublicArtifact',
      convertPrivateKernelTailToPublicInputsToWitnessMap,
      convertPrivateKernelTailForPublicOutputsFromWitnessMap,
    );
  }

  public async simulateTail(
    privateInputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    const isForPublic = privateInputs.isForPublic();
    const [duration, result] = await elapsed(() =>
      isForPublic ? executeTailForPublic(privateInputs) : executeTail(privateInputs),
    );
    this.log.debug(`Simulated private kernel ordering`, {
      eventName: 'circuit-simulation',
      circuitName: 'private-kernel-tail',
      duration,
      inputSize: privateInputs.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return this.makeEmptyKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>(
      result,
      isForPublic ? 'PrivateKernelTailToPublicArtifact' : 'PrivateKernelTailArtifact',
    );
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

  private async generateCircuitOutput<
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

  private makeEmptyKernelSimulateOutput<
    PublicInputsType extends PrivateKernelTailCircuitPublicInputs | PrivateKernelCircuitPublicInputs,
  >(publicInputs: PublicInputsType, circuitType: ClientProtocolArtifact) {
    const kernelProofOutput: PrivateKernelSimulateOutput<PublicInputsType> = {
      publicInputs,
      verificationKey: ClientCircuitVks[circuitType].keyAsFields,
      outputWitness: new Map(),
      bytecode: Buffer.from([]),
    };
    return kernelProofOutput;
  }
}
