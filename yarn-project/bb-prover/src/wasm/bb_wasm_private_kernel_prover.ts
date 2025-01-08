import { AztecClientBackend } from '@aztec/bb.js';
import { type PrivateKernelProver, type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
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
import { Timer } from '@aztec/foundation/timer';
import { type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { ClientCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { WASMSimulator } from '@aztec/simulator/client';

import { type WitnessMap } from '@noir-lang/noir_js';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { ungzip } from 'pako';

export abstract class BBWasmPrivateKernelProver implements PrivateKernelProver {
  protected simulator = new WASMSimulator();

  constructor(protected threads: number = 1, protected log = createLogger('bb-prover:wasm')) {}

  generateInitOutput(
    _privateKernelInputsInit: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  simulateInit(
    _privateKernelInputsInit: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  generateInnerOutput(
    _privateKernelInputsInner: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  simulateInner(
    _privateKernelInputsInner: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  generateResetOutput(
    _privateKernelInputsReset: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  simulateReset(
    _privateKernelInputsReset: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  generateTailOutput(
    _privateKernelInputsTail: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
  }

  simulateTail(
    _privateKernelInputsTail: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    throw new Error('Method not implemented.');
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

  protected makeEmptyKernelSimulateOutput<
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

  computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    return Promise.resolve(0);
  }
}
