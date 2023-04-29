import { serializeToBuffer } from '../../utils/serialize.js';
import { BaseOrMergeRollupPublicInputs } from './base_or_merge_rollup_public_inputs.js';
import { ROLLUP_VK_TREE_HEIGHT } from '../constants.js';
import { UInt32 } from '../shared.js';
import { MembershipWitness } from '../membership_witness.js';
import { VerificationKey } from '../verification_key.js';
import { Proof } from '../proof.js';

export class PreviousRollupData {
  constructor(
    public publicInputs: BaseOrMergeRollupPublicInputs,
    public proof: Proof,
    public vk: VerificationKey,
    /**
     * The index of the rollup circuit's vk in a big tree of rollup circuit vks.
     */
    public vkIndex: UInt32,
    public vkSiblingPath: MembershipWitness<typeof ROLLUP_VK_TREE_HEIGHT>,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkSiblingPath);
  }
}
