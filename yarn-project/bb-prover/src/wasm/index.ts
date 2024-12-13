import { AztecClientBackend } from '@aztec/bb.js';
import { PrivateKernelProver, PrivateKernelSimulateOutput } from '@aztec/circuit-types';
import {
  ClientIvcProof,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelTailCircuitPrivateInputs,
  PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import {
  ClientCircuitArtifacts,
  ClientCircuitVks,
  ClientProtocolArtifact,
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
} from '@aztec/noir-protocol-circuits-types/client';
import { WASMSimulator } from '@aztec/simulator/client';
import { NoirCompiledCircuit } from '@aztec/types/noir';

import { WitnessMap } from '@noir-lang/noir_js';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { ungzip } from 'pako';

export class BBWasmPrivateKernelProver implements PrivateKernelProver {
  private simulator = new WASMSimulator();

  constructor(private threads: number = 1, private log = createLogger('bb-prover:wasm')) {}

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

  async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    const timer = new Timer();
    this.log.info(`Generating ClientIVC proof...`);
    const backend = new AztecClientBackend(
      acirs.map(acir => ungzip(acir)),
      { threads: this.threads },
    );

    const [proof, vk] = await backend.prove(witnessStack.map(witnessMap => ungzip(serializeWitness(witnessMap))));
    await backend.destroy();
    this.log.info(`Generated ClientIVC proof`, {
      eventName: 'client-ivc-proof-generation',
      duration: timer.ms(),
      proofSize: proof.length,
      vkSize: vk.length,
    });
    return new ClientIvcProof(Buffer.from(proof), Buffer.from(vk));
  }

  computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    return Promise.resolve(0);
  }
}
