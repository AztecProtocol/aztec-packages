import { type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
import { type CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
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
  getClientCircuitArtifactByName,
  getPrivateKernelResetArtifactName,
  maxPrivateKernelResetDimensions,
} from '@aztec/noir-protocol-circuits-types/client/lazy';
import { type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { ClientCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { type WitnessMap } from '@noir-lang/types';

import { BBWasmPrivateKernelProver } from './bb_wasm_private_kernel_prover.js';

export class BbWasmAsyncPrivateKernelProver extends BBWasmPrivateKernelProver {
  constructor(threads: number = 1, log = createLogger('bb-prover:wasm:async')) {
    super(threads, log);
  }

  public override async generateInitOutput(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMap,
      convertPrivateKernelInitOutputsFromWitnessMap,
    );
  }

  public override async simulateInit(
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

  public override async generateInnerOutput(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.generateCircuitOutput(
      inputs,
      'PrivateKernelInnerArtifact',
      convertPrivateKernelInnerInputsToWitnessMap,
      convertPrivateKernelInnerOutputsFromWitnessMap,
    );
  }

  public override async simulateInner(
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

  public override async generateResetOutput(
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

  public override async simulateReset(
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

  public override async generateTailOutput(
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

  public override async simulateTail(
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

  private async generateCircuitOutput<
    I extends { toBuffer: () => Buffer },
    O extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
  >(
    inputs: I,
    circuitType: ClientProtocolArtifact,
    convertInputs: (inputs: I) => Promise<WitnessMap>,
    convertOutputs: (outputs: WitnessMap) => Promise<O>,
  ): Promise<PrivateKernelSimulateOutput<O>> {
    this.log.debug(`Generating witness for ${circuitType}`);
    const compiledCircuit: NoirCompiledCircuit = await getClientCircuitArtifactByName(circuitType);

    const witnessMap = await convertInputs(inputs);
    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = await convertOutputs(outputWitness);

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
}
