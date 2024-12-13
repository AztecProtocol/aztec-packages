import {
  type AppCircuitSimulateOutput,
  type PrivateKernelProver,
  type PrivateKernelSimulateOutput,
} from '@aztec/circuit-types';
import type { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  ClientIvcProof,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  type ProtocolArtifact,
  ProtocolCircuitVks,
  executeInit,
  executeInner,
  executeReset,
  executeTail,
  executeTailForPublic,
  getPrivateKernelResetArtifactName,
  maxPrivateKernelResetDimensions,
} from '@aztec/noir-protocol-circuits-types';

import { type WitnessMap } from '@noir-lang/types';

/**
 * Test Proof Creator executes circuit simulations and provides fake proofs.
 */
export class TestPrivateKernelProver implements PrivateKernelProver {
  constructor(private log = createLogger('pxe:test_proof_creator')) {}

  createClientIvcProof(_acirs: Buffer[], _witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    return Promise.resolve(ClientIvcProof.empty());
  }

  public async simulateProofInit(
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

  public async simulateProofInner(
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

  public async simulateProofReset(
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

  public async simulateProofTail(
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

  public computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    // No gates in test prover
    return Promise.resolve(0);
  }

  private makeEmptyKernelSimulateOutput<
    PublicInputsType extends PrivateKernelTailCircuitPublicInputs | PrivateKernelCircuitPublicInputs,
  >(publicInputs: PublicInputsType, circuitType: ProtocolArtifact) {
    const kernelProofOutput: PrivateKernelSimulateOutput<PublicInputsType> = {
      publicInputs,
      verificationKey: ProtocolCircuitVks[circuitType].keyAsFields,
      outputWitness: new Map(),
      bytecode: Buffer.from([]),
    };
    return kernelProofOutput;
  }
}
