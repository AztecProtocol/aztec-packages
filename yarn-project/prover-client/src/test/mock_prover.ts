import {
  type ProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  type KernelCircuitPublicInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PublicKernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeKernelCircuitPublicInputs,
  makeParityPublicInputs,
  makePublicKernelCircuitPublicInputs,
  makeRootRollupPublicInputs,
  makeVMCircuitPublicInputs,
} from '@aztec/circuits.js/testing';

export class MockProver implements ServerCircuitProver {
  constructor() {}

  getAvmProof() {
    return Promise.resolve(
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof<number>(0),
        VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      ),
    );
  }

  getBaseParityProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getRootParityProof() {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBaseRollupProof() {
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

  getPublicKernelInnerProof(): Promise<PublicInputsAndRecursiveProof<VMCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeVMCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPublicKernelMergeProof(): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makePublicKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPublicTailProof(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
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

  getTubeProof(): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return Promise.resolve(
      makeProofAndVerificationKey(makeRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFake()),
    );
  }
}
