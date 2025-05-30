import { createLogger } from '@aztec/foundation/log';
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
  foreignCallHandler,
  getPrivateKernelResetArtifactName,
  updateResetCircuitSampleInputs,
} from '@aztec/noir-protocol-circuits-types/client';
import type { ArtifactProvider, ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import type { Abi, WitnessMap } from '@aztec/noir-types';
import type { CircuitSimulator } from '@aztec/simulator/client';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import type {
  PrivateExecutionStep,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelSimulateOutput,
  PrivateKernelTailCircuitPrivateInputs,
  PrivateKernelTailCircuitPublicInputs,
} from '@aztec/stdlib/kernel';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
import type { ClientIvcProof } from '@aztec/stdlib/proofs';
import type { CircuitSimulationStats, CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';

import { mapProtocolArtifactNameToCircuitName } from '../../stats.js';

export abstract class BBPrivateKernelProver implements PrivateKernelProver {
  constructor(
    protected artifactProvider: ArtifactProvider,
    protected simulator: CircuitSimulator,
    protected log = createLogger('bb-prover'),
  ) {}

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
    updateResetCircuitSampleInputs(inputs);
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
    const compiledCircuit: NoirCompiledCircuitWithName =
      await this.artifactProvider.getSimulatedClientCircuitArtifactByName(circuitType);

    const witnessMap = convertInputs(inputs, compiledCircuit.abi);

    const outputWitness = await this.simulator
      .executeProtocolCircuit(witnessMap, compiledCircuit, foreignCallHandler)
      .catch((err: Error) => {
        this.log.debug(`Failed to simulate ${circuitType}`, {
          circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
          error: err,
        });
        throw err;
      });
    const output = convertOutputs(outputWitness.witness, compiledCircuit.abi);

    this.log.debug(`Simulated ${circuitType}`, {
      eventName: 'circuit-simulation',
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: outputWitness.duration,
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
    const compiledCircuit: NoirCompiledCircuitWithName =
      await this.artifactProvider.getClientCircuitArtifactByName(circuitType);

    const witnessMap = convertInputs(inputs, compiledCircuit.abi);
    const outputWitness = await this.simulator.executeProtocolCircuit(witnessMap, compiledCircuit, foreignCallHandler);
    const output = convertOutputs(outputWitness.witness, compiledCircuit.abi);

    this.log.debug(`Generated witness for ${circuitType}`, {
      eventName: 'circuit-witness-generation',
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: outputWitness.duration,
      inputSize: inputs.toBuffer().length,
      outputSize: output.toBuffer().length,
    } satisfies CircuitWitnessGenerationStats);

    const verificationKey = await this.artifactProvider.getCircuitVkByName(circuitType);
    const bytecode = Buffer.from(compiledCircuit.bytecode, 'base64');

    const kernelOutput: PrivateKernelSimulateOutput<O> = {
      publicInputs: output,
      verificationKey,
      outputWitness: outputWitness.witness,
      bytecode,
    };
    return kernelOutput;
  }

  public async makeEmptyKernelSimulateOutput<
    PublicInputsType extends PrivateKernelTailCircuitPublicInputs | PrivateKernelCircuitPublicInputs,
  >(publicInputs: PublicInputsType, circuitType: ClientProtocolArtifact) {
    const kernelProofOutput: PrivateKernelSimulateOutput<PublicInputsType> = {
      publicInputs,
      verificationKey: await this.artifactProvider.getCircuitVkByName(circuitType),
      outputWitness: new Map(),
      bytecode: Buffer.from([]),
    };
    return kernelProofOutput;
  }

  public createClientIvcProof(_executionSteps: PrivateExecutionStep[]): Promise<ClientIvcProof> {
    throw new Error('Not implemented');
  }

  public computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    throw new Error('Not implemented');
  }
}
