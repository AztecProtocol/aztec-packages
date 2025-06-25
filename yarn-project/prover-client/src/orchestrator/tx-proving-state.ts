import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_VK_INDEX,
  PRIVATE_TUBE_VK_INDEX,
  PUBLIC_TUBE_VK_INDEX,
  type TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';
import {
  AvmProofData,
  type BaseRollupHints,
  PrivateBaseRollupHints,
  PrivateBaseRollupInputs,
  PrivateTubeData,
  PublicBaseRollupHints,
  PublicBaseRollupInputs,
  PublicTubeData,
  TubeInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import type { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx } from '@aztec/stdlib/tx';
import { VerificationKeyData, VkData } from '@aztec/stdlib/vks';

/**
 * Helper class to manage the proving cycle of a transaction
 * This includes the public VMs and the public kernels
 * Also stores the inputs to the base rollup for this transaction and the tree snapshots
 */
export class TxProvingState {
  private tube?: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
  private avm?: ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;

  constructor(
    public readonly processedTx: ProcessedTx,
    private readonly baseRollupHints: BaseRollupHints,
    public readonly treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ) {}

  get requireAvmProof() {
    return !!this.processedTx.avmProvingRequest;
  }

  public ready() {
    return !!this.tube && (!this.requireAvmProof || !!this.avm);
  }

  public getTubeInputs() {
    return new TubeInputs(!!this.processedTx.data.forPublic, this.processedTx.clientIvcProof);
  }

  public getAvmInputs(): AvmCircuitInputs {
    return this.processedTx.avmProvingRequest!.inputs;
  }

  public getBaseRollupTypeAndInputs() {
    if (this.requireAvmProof) {
      return {
        rollupType: 'public-base-rollup' satisfies CircuitName,
        inputs: this.#getPublicBaseInputs(),
      };
    } else {
      return {
        rollupType: 'private-base-rollup' satisfies CircuitName,
        inputs: this.#getPrivateBaseInputs(),
      };
    }
  }

  public setTubeProof(tubeProofAndVk: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>) {
    this.tube = tubeProofAndVk;
  }

  public setAvmProof(avmProofAndVk: ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>) {
    this.avm = avmProofAndVk;
  }

  #getPrivateBaseInputs() {
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup.');
    }

    const vkData = this.#getVkData(this.tube!.verificationKey, PRIVATE_TUBE_VK_INDEX);
    const tubeData = new PrivateTubeData(
      this.processedTx.data.toPrivateToRollupKernelCircuitPublicInputs(),
      this.tube.proof,
      vkData,
    );

    if (!(this.baseRollupHints instanceof PrivateBaseRollupHints)) {
      throw new Error('Mismatched base rollup hints, expected private base rollup hints');
    }
    return new PrivateBaseRollupInputs(tubeData, this.baseRollupHints);
  }

  #getPublicBaseInputs() {
    if (!this.processedTx.avmProvingRequest) {
      throw new Error('Should create private base rollup for a tx not requiring avm proof.');
    }
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup: tube proof undefined');
    }
    if (!this.avm) {
      throw new Error('Tx not ready for proving base rollup: avm proof undefined');
    }

    const tubeData = new PublicTubeData(
      this.processedTx.data.toPrivateToPublicKernelCircuitPublicInputs(),
      this.tube.proof,
      this.#getVkData(this.tube!.verificationKey, PUBLIC_TUBE_VK_INDEX),
    );

    const avmProofData = new AvmProofData(
      this.processedTx.avmProvingRequest.inputs.publicInputs,
      this.avm.proof,
      this.#getVkData(this.avm!.verificationKey, AVM_VK_INDEX),
    );

    if (!(this.baseRollupHints instanceof PublicBaseRollupHints)) {
      throw new Error('Mismatched base rollup hints, expected public base rollup hints');
    }

    return new PublicBaseRollupInputs(tubeData, avmProofData, this.baseRollupHints);
  }

  #getVkData(verificationKey: VerificationKeyData, vkIndex: number) {
    const vkPath = getVKSiblingPath(vkIndex);
    return new VkData(verificationKey, vkIndex, vkPath);
  }
}
