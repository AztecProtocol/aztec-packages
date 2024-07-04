import { type AppCircuitSimulateOutput, type PrivateKernelSimulateOutput, type PrivateKernelProver } from '@aztec/circuit-types';
import type { CircuitName, CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  VerificationKeyAsFields,
  ClientIvcProof,
} from '@aztec/circuits.js';
import { siloNoteHash } from '@aztec/circuits.js/hash';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  executeInit,
  executeInner,
  executeReset,
  executeTail,
  executeTailForPublic,
} from '@aztec/noir-protocol-circuits-types';
import { type WitnessMap } from '@noir-lang/types';

/**
 * Test Proof Creator executes circuit simulations and provides fake proofs.
 */
export class TestPrivateKernelProver implements PrivateKernelProver {
  constructor(private log = createDebugLogger('aztec:test_proof_creator')) { }

  createClientIvcProof(_acirs: Buffer[], _witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    return Promise.resolve(ClientIvcProof.empty());
  }

  public getSiloedCommitments(publicInputs: PrivateCircuitPublicInputs) {
    const contractAddress = publicInputs.callContext.storageContractAddress;

    return Promise.resolve(
      publicInputs.newNoteHashes.map(commitment => siloNoteHash(contractAddress, commitment.value)),
    );
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
    return this.makeEmptyKernelProofOutput<PrivateKernelCircuitPublicInputs>(result);
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
    return this.makeEmptyKernelProofOutput<PrivateKernelCircuitPublicInputs>(result);
  }

  public async simulateProofReset(
    privateInputs: PrivateKernelResetCircuitPrivateInputsVariants,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const [duration, result] = await elapsed(() => executeReset(privateInputs));
    this.log.debug(`Simulated private kernel reset`, {
      eventName: 'circuit-simulation',
      circuitName: ('private-kernel-reset-' + privateInputs.sizeTag) as CircuitName,
      duration,
      inputSize: privateInputs.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return this.makeEmptyKernelProofOutput<PrivateKernelCircuitPublicInputs>(result);
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
    return this.makeEmptyKernelProofOutput<PrivateKernelTailCircuitPublicInputs>(result);
  }

  computeAppCircuitVerificationKey(_bytecode: Buffer, _appCircuitName?: string | undefined): Promise<AppCircuitSimulateOutput> {
    const appCircuitProofOutput: AppCircuitSimulateOutput = {
      verificationKey: VerificationKeyAsFields.makeEmpty(),
    };
    return Promise.resolve(appCircuitProofOutput);
  }

  private makeEmptyKernelProofOutput<PublicInputsType>(publicInputs: PublicInputsType) {
    const kernelProofOutput: PrivateKernelSimulateOutput<PublicInputsType> = {
      publicInputs,
      verificationKey: VerificationKeyAsFields.makeEmpty(),
      // LONDONTODO reconsider jamming this everywhere
      outputWitness: new Map()
    };
    return kernelProofOutput;
  }
}
