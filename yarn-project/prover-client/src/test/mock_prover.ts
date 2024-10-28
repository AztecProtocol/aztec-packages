import {
  type ProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  type KernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  VerificationKeyData,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeKernelCircuitPublicInputs,
  makeRootParityInput,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/testing';

export class MockProver implements ServerCircuitProver {
  constructor() {}

  getAvmProof() {
    return Promise.resolve(
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
        VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getBaseParityProof() {
    return Promise.resolve(makeRootParityInput(RECURSIVE_PROOF_LENGTH));
  }

  getRootParityProof() {
    return Promise.resolve(makeRootParityInput(RECURSIVE_PROOF_LENGTH));
  }

  getPrivateBaseRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPublicBaseRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getMergeRollupProof(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockMergeRollupProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getEmptyBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockRootRollupProof(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getEmptyPrivateKernelProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getEmptyTubeProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getRootRollupProof(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeRootRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getTubeProof(): Promise<ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>> {
    return Promise.resolve(
      makeProofAndVerificationKey(makeRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFake()),
    );
  }
}
