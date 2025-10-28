import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_VK_INDEX,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { getVkData } from '@aztec/noir-protocol-circuits-types/server/vks';
import { getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import type { ProofAndVerificationKey, PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { ProofData } from '@aztec/stdlib/proofs';
import {
  type BaseRollupHints,
  PrivateBaseRollupHints,
  PrivateTxBaseRollupPrivateInputs,
  PublicBaseRollupHints,
  PublicChonkVerifierPublicInputs,
  PublicTxBaseRollupPrivateInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import type { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx } from '@aztec/stdlib/tx';
import { VerificationKeyData, VkData } from '@aztec/stdlib/vks';

import {
  getChonkProofFromTx,
  getPublicChonkVerifierPrivateInputsFromTx,
  toProofData,
} from './block-building-helpers.js';

/**
 * Helper class to manage the proving cycle of a transaction
 * This includes the public VMs and the public kernels
 * Also stores the inputs to the base rollup for this transaction and the tree snapshots
 */
export class TxProvingState {
  private publicChonkVerifier?: PublicInputsAndRecursiveProof<
    PublicChonkVerifierPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  private avm?: ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;

  constructor(
    public readonly processedTx: ProcessedTx,
    private readonly baseRollupHints: BaseRollupHints,
    public readonly treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
    private readonly proverId: Fr,
  ) {}

  get requireAvmProof() {
    return !!this.processedTx.avmProvingRequest;
  }

  public ready() {
    return !this.requireAvmProof || (!!this.avm && !!this.publicChonkVerifier);
  }

  public getAvmInputs(): AvmCircuitInputs {
    return this.processedTx.avmProvingRequest!.inputs;
  }

  public getPublicChonkVerifierPrivateInputs() {
    return getPublicChonkVerifierPrivateInputsFromTx(this.processedTx, this.proverId);
  }

  public getBaseRollupTypeAndInputs() {
    if (this.requireAvmProof) {
      return {
        rollupType: 'rollup-tx-base-public' satisfies CircuitName,
        inputs: this.#getPublicBaseInputs(),
      };
    } else {
      return {
        rollupType: 'rollup-tx-base-private' satisfies CircuitName,
        inputs: this.#getPrivateBaseInputs(),
      };
    }
  }

  public setPublicChonkVerifierProof(
    publicChonkVerifierProofAndVk: PublicInputsAndRecursiveProof<
      PublicChonkVerifierPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.publicChonkVerifier = publicChonkVerifierProofAndVk;
  }

  public setAvmProof(avmProofAndVk: ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>) {
    this.avm = avmProofAndVk;
  }

  #getPrivateBaseInputs() {
    if (!(this.baseRollupHints instanceof PrivateBaseRollupHints)) {
      throw new Error('Mismatched base rollup hints, expected private base rollup hints');
    }

    const privateTailProofData = new ProofData(
      this.processedTx.data.toPrivateToRollupKernelCircuitPublicInputs(),
      getChonkProofFromTx(this.processedTx),
      getVkData('HidingKernelToRollup'),
    );

    return new PrivateTxBaseRollupPrivateInputs(privateTailProofData, this.baseRollupHints);
  }

  #getPublicBaseInputs() {
    if (!this.processedTx.avmProvingRequest) {
      throw new Error('Should create private base rollup for a tx not requiring avm proof.');
    }
    if (!this.publicChonkVerifier) {
      throw new Error('Tx not ready for proving base rollup: public chonk verifier proof undefined');
    }
    if (!this.avm) {
      throw new Error('Tx not ready for proving base rollup: avm proof undefined');
    }
    if (!(this.baseRollupHints instanceof PublicBaseRollupHints)) {
      throw new Error('Mismatched base rollup hints, expected public base rollup hints');
    }

    const publicChonkVerifierProofData = toProofData(this.publicChonkVerifier);

    const avmProofData = new ProofData(
      this.processedTx.avmProvingRequest.inputs.publicInputs,
      this.avm.proof,
      this.#getVkData(this.avm!.verificationKey, AVM_VK_INDEX),
    );

    return new PublicTxBaseRollupPrivateInputs(publicChonkVerifierProofData, avmProofData, this.baseRollupHints);
  }

  #getVkData(verificationKey: VerificationKeyData, vkIndex: number) {
    // TODO(#17162): Add avm vk hash to the tree and call `getVkData('AVM')` instead.
    // Below will return a path to an empty leaf.
    const vkPath = getVKSiblingPath(vkIndex);
    return new VkData(verificationKey, vkIndex, vkPath);
  }
}
