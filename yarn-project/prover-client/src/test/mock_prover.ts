import {
  type PublicInputsAndRecursiveProof,
  type PublicInputsAndTubeProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  AvmVerificationKeyData,
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type KernelCircuitPublicInputs,
  type PublicKernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootRollupPublicInputs,
  type VMCircuitPublicInputs,
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
  makeVMCircuitPublicInputs,
} from '@aztec/circuits.js/testing';

export class MockProver implements ServerCircuitProver {
  constructor() {}

  getAvmProof() {
    return Promise.resolve(
      Promise.resolve({
        proof: makeEmptyProof(),
        verificationKey: AvmVerificationKeyData.makeFake(),
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
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getMergeRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getBlockMergeRollupProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getEmptyBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getEmptyPrivateKernelProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getEmptyTubeProof(): Promise<PublicInputsAndTubeProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getPublicKernelInnerProof(): Promise<PublicInputsAndRecursiveProof<VMCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeVMCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getPublicKernelMergeProof(): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makePublicKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getPublicTailProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getRootRollupProof(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeRootRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getTubeProof(): Promise<{
    tubeVK: VerificationKeyData;
    tubeProof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>;
  }> {
    return Promise.resolve({
      tubeVK: VerificationKeyData.makeFake(HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      tubeProof: makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
    });
  }
}
