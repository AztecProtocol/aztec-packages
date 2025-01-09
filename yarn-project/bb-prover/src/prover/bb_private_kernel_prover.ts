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
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
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
  getPrivateKernelResetArtifactName,
} from '@aztec/noir-protocol-circuits-types/client';
import { type ArtifactProvider, type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { ClientCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { WASMSimulator } from '@aztec/simulator/client';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { type Abi, type WitnessMap } from '@noir-lang/types';

import { mapProtocolArtifactNameToCircuitName } from '../stats.js';

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
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.simulateCircuitOutput(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMapWithAbi,
      convertPrivateKernelInitOutputsFromWitnessMapWithAbi,
    );
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
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.simulateCircuitOutput(
      inputs,
      'PrivateKernelInnerArtifact',
      convertPrivateKernelInnerInputsToWitnessMapWithAbi,
      convertPrivateKernelInnerOutputsFromWitnessMapWithAbi,
    );
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
    inputs: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const variantInputs = inputs.trimToSizes();
    const artifactName = getPrivateKernelResetArtifactName(inputs.dimensions);
    return await this.simulateCircuitOutput(
      variantInputs,
      artifactName,
      convertPrivateKernelResetInputsToWitnessMapWithAbi,
      convertPrivateKernelResetOutputsFromWitnessMapWithAbi,
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
    inputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    if (!inputs.isForPublic()) {
      return await this.simulateCircuitOutput(
        inputs,
        'PrivateKernelTailArtifact',
        convertPrivateKernelTailInputsToWitnessMapWithAbi,
        convertPrivateKernelTailOutputsFromWitnessMapWithAbi,
      );
    }
    return await this.simulateCircuitOutput(
      inputs,
      'PrivateKernelTailToPublicArtifact',
      convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi,
      convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi,
    );
  }

  public async simulateCircuitOutput<
    I extends { toBuffer: () => Buffer },
    O extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
  >(
    inputs: I,
    circuitType: ClientProtocolArtifact,
    convertInputs: (inputs: I, abi: Abi) => WitnessMap,
    convertOutputs: (outputs: WitnessMap, abi: Abi) => O,
  ): Promise<PrivateKernelSimulateOutput<O>> {
    const compiledCircuit: NoirCompiledCircuit = await this.artifactProvider.getSimulatedClientCircuitArtifactByName(
      circuitType,
    );

    const witnessMap = convertInputs(inputs, compiledCircuit.abi);

    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = convertOutputs(outputWitness, compiledCircuit.abi);

    this.log.debug(`Simulated ${circuitType}`, {
      eventName: 'circuit-simulation',
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: timer.ms(),
      inputSize: inputs.toBuffer().length,
      outputSize: output.toBuffer().length,
    } satisfies CircuitSimulationStats);

    return this.makeEmptyKernelSimulateOutput<O>(output, circuitType);
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

    const witnessMap = convertInputs(inputs, compiledCircuit.abi);
    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = convertOutputs(outputWitness, compiledCircuit.abi);

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

  public createClientIvcProof(_acirs: Buffer[], _witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    throw new Error('Not implemented');
  }

  public computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    throw new Error('Not implemented');
  }
}
