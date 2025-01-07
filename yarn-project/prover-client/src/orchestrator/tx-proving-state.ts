import { type MerkleTreeId, type ProcessedTx, type ProofAndVerificationKey } from '@aztec/circuit-types';
import { type CircuitName } from '@aztec/circuit-types/stats';
import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VK_INDEX,
  type AppendOnlyTreeSnapshot,
  type TUBE_PROOF_LENGTH,
  TUBE_VK_INDEX,
  VkWitnessData,
} from '@aztec/circuits.js';
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
} from '@aztec/circuits.js/rollup';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';

/**
 * Helper class to manage the proving cycle of a transaction
 * This includes the public VMs and the public kernels
 * Also stores the inputs to the base rollup for this transaction and the tree snapshots
 */
export class TxProvingState {
  private tube?: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
  private avm?: ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>;

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
    return new TubeInputs(this.processedTx.clientIvcProof);
  }

  public getAvmInputs() {
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

  public setAvmProof(avmProofAndVk: ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>) {
    this.avm = avmProofAndVk;
  }

  #getPrivateBaseInputs() {
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup.');
    }

    const vkData = this.#getTubeVkData();
    const tubeData = new PrivateTubeData(this.processedTx.data.toKernelCircuitPublicInputs(), this.tube.proof, vkData);

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
      this.processedTx.data.toPublicKernelCircuitPublicInputs(),
      this.tube.proof,
      this.#getTubeVkData(),
    );

    const avmProofData = new AvmProofData(
      this.processedTx.avmProvingRequest.inputs.output,
      this.avm.proof,
      this.#getAvmVkData(),
    );

    if (!(this.baseRollupHints instanceof PublicBaseRollupHints)) {
      throw new Error('Mismatched base rollup hints, expected public base rollup hints');
    }

    return new PublicBaseRollupInputs(tubeData, avmProofData, this.baseRollupHints);
  }

  #getTubeVkData() {
    let vkIndex = TUBE_VK_INDEX;
    try {
      vkIndex = getVKIndex(this.tube!.verificationKey);
    } catch (_ignored) {
      // TODO(#7410) The VK for the tube won't be in the tree for now, so we manually set it to the tube vk index
    }
    const vkPath = getVKSiblingPath(vkIndex);

    return new VkWitnessData(this.tube!.verificationKey, vkIndex, vkPath);
  }

  #getAvmVkData() {
    const vkIndex = AVM_VK_INDEX;
    const vkPath = getVKSiblingPath(vkIndex);
    return new VkWitnessData(this.avm!.verificationKey, AVM_VK_INDEX, vkPath);
  }
}
