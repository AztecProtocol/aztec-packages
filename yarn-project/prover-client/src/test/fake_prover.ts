import {
  type PublicInputsAndRecursiveProof,
  type PublicInputsAndTubeProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  type KernelCircuitPublicInputs,
  type PublicKernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootRollupPublicInputs,
  VerificationKeyData,
  makeEmptyProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeKernelCircuitPublicInputs,
  makePublicKernelCircuitPublicInputs,
  makeRootParityInput,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/testing';
import { sleep } from '@aztec/foundation/sleep';

export class FakeProver implements ServerCircuitProver {
  constructor(private minSleepMs = 500, private maxSleepMs = 5000) {}

  async getAvmProof() {
    await this.randomSleep();
    return {
      proof: makeEmptyProof(),
      verificationKey: VerificationKeyData.makeFake(),
    };
  }

  async getBaseParityProof() {
    await this.randomSleep();
    return makeRootParityInput(RECURSIVE_PROOF_LENGTH);
  }

  async getRootParityProof() {
    await this.randomSleep();
    return makeRootParityInput(RECURSIVE_PROOF_LENGTH);
  }

  async getBaseRollupProof() {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeBaseOrMergeRollupPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getMergeRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeBaseOrMergeRollupPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getBlockMergeRollupProof() {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeBlockRootOrBlockMergeRollupPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeBlockRootOrBlockMergeRollupPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getEmptyPrivateKernelProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeKernelCircuitPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getEmptyTubeProof(): Promise<PublicInputsAndTubeProof<KernelCircuitPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeKernelCircuitPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getPublicKernelProof(): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makePublicKernelCircuitPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getPublicTailProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeKernelCircuitPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getRootRollupProof(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    await this.randomSleep();
    return makePublicInputsAndRecursiveProof(
      makeRootRollupPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFake(),
    );
  }

  async getTubeProof(): Promise<{
    tubeVK: VerificationKeyData;
    tubeProof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>;
  }> {
    await this.randomSleep();
    return {
      tubeVK: VerificationKeyData.makeFake(),
      tubeProof: makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
    };
  }

  randomSleep() {
    return sleep(this.minSleepMs + Math.random() * (this.maxSleepMs - this.minSleepMs));
  }
}
