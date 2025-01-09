import { type PrivateKernelProver, type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
import { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  ClientIvcProof,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { Timer, elapsed } from '@aztec/foundation/timer';
import {
  convertPrivateKernelInitInputsToWitnessMapWithAbi,
  convertPrivateKernelInitOutputsFromWitnessMapWithAbi,
  convertPrivateKernelInnerInputsToWitnessMapWithAbi,
  convertPrivateKernelInnerOutputsFromWitnessMapWithAbi,
  convertPrivateKernelResetInputsToWitnessMapWithAbi,
  convertPrivateKernelResetOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailInputsToWitnessMapWithAbi,
  convertPrivateKernelTailOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi,
  executeInitWithArtifact,
  executeInnerWithArtifact,
  executeResetWithArtifact,
  executeTailForPublicWithArtifact,
  executeTailWithArtifact,
  getPrivateKernelResetArtifactName,
  maxPrivateKernelResetDimensions,
} from '@aztec/noir-protocol-circuits-types/client';
import { ArtifactProvider, type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { ClientCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { WASMSimulator } from '@aztec/simulator/client';
import { NoirCompiledCircuit } from '@aztec/types/noir';

import { type WitnessMap } from '@noir-lang/noir_js';
import { Abi } from '@noir-lang/types';

export abstract class BBPrivateKernelProver implements PrivateKernelProver {
  protected simulator = new WASMSimulator();

  constructor(protected artifactProvider: ArtifactProvider, protected log = createLogger('bb-prover')) {}

  public async generateInitOutput(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMapWithAbi,
      convertPrivateKernelInitOutputsFromWitnessMapWithAbi,
    );
  }
  public async simulateInit(
    privateInputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const artifact = await this.artifactProvider.getSimulatedClientCircuitArtifactByName('PrivateKernelInitArtifact');
    const [duration, result] = await elapsed(() => executeInitWithArtifact(privateInputs, artifact));
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
      convertPrivateKernelInnerInputsToWitnessMapWithAbi,
      convertPrivateKernelInnerOutputsFromWitnessMapWithAbi,
    );
  }

  public async simulateInner(
    privateInputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const artifact = await this.artifactProvider.getSimulatedClientCircuitArtifactByName('PrivateKernelInnerArtifact');
    const [duration, result] = await elapsed(() => executeInnerWithArtifact(privateInputs, artifact));
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
      convertPrivateKernelResetInputsToWitnessMapWithAbi,
      convertPrivateKernelResetOutputsFromWitnessMapWithAbi,
    );
  }

  public async simulateReset(
    privateInputs: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const artifact = await this.artifactProvider.getSimulatedClientCircuitArtifactByName(
      getPrivateKernelResetArtifactName(privateInputs.dimensions),
    );
    const variantPrivateInputs = privateInputs.trimToSizes();
    const [duration, result] = await elapsed(() =>
      executeResetWithArtifact(variantPrivateInputs, artifact, privateInputs),
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
        convertPrivateKernelTailInputsToWitnessMapWithAbi,
        convertPrivateKernelTailOutputsFromWitnessMapWithAbi,
      );
    }
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelTailToPublicArtifact',
      convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi,
      convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi,
    );
  }

  public async simulateTail(
    privateInputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    const isForPublic = privateInputs.isForPublic();
    const artifactName = isForPublic ? 'PrivateKernelTailToPublicArtifact' : 'PrivateKernelTailArtifact';
    const artifact = await this.artifactProvider.getSimulatedClientCircuitArtifactByName(artifactName);
    const [duration, result] = await elapsed(() =>
      isForPublic
        ? executeTailForPublicWithArtifact(privateInputs, artifact)
        : executeTailWithArtifact(privateInputs, artifact),
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

  public async generateCircuitOutput<
    I extends { toBuffer: () => Buffer },
    O extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
  >(
    inputs: I,
    circuitType: ClientProtocolArtifact,
    convertInputs: (inputs: I, abi: Abi) => WitnessMap,
    convertOutputs: (outputs: WitnessMap, abi: Abi) => O,
  ): Promise<PrivateKernelSimulateOutput<O>> {
    this.log.debug(`Generating witness for ${circuitType}`);
    const compiledCircuit: NoirCompiledCircuit = await this.artifactProvider.getClientCircuitArtifactByName(
      circuitType,
    );

    const witnessMap = await convertInputs(inputs, compiledCircuit.abi);
    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = await convertOutputs(outputWitness, compiledCircuit.abi);

    this.log.debug(`Generated witness for ${circuitType}`, {
      eventName: 'circuit-witness-generation',
      circuitName: circuitType,
      duration: timer.ms(),
      inputSize: inputs.toBuffer().length,
      outputSize: output.toBuffer().length,
    });

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

  public makeEmptyKernelSimulateOutput<
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

  public async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    throw new Error('Not implemented');
  }

  public computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    throw new Error('Not implemented');
  }
}
