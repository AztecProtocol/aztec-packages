import {
  type PublicInputsAndRecursiveProof,
  type PublicInputsAndTubeProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
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

export class MockProver implements ServerCircuitProver {
  constructor() {}

  getAvmProof() {
    return Promise.resolve(
      Promise.resolve({
        proof: makeEmptyProof(),
        verificationKey: VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      }),
    );
  }

  getBaseParityProof() {
    return Promise.resolve(makeRootParityInput(RECURSIVE_PROOF_LENGTH));
  }

  getRootParityProof() {
    return Promise.resolve(makeRootParityInput(RECURSIVE_PROOF_LENGTH));
  }

  getBaseRollupProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getMergeRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getBlockMergeRollupProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getEmptyPrivateKernelProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getEmptyTubeProof(): Promise<PublicInputsAndTubeProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getPublicKernelProof(): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makePublicKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getPublicTailProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getRootRollupProof(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeRootRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(),
      ),
    );
  }

  getTubeProof(): Promise<{
    tubeVK: VerificationKeyData;
    tubeProof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>;
  }> {
    return Promise.resolve({
      tubeVK: VerificationKeyData.makeFake(),
      tubeProof: makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
    });
  }
}
