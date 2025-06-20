import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { RecursiveProof } from '../proofs/recursive_proof.js';
import { VkData } from '../vks/index.js';
import { BaseOrMergeRollupPublicInputs } from './base_or_merge_rollup_public_inputs.js';

/**
 * Represents the data of a previous merge or base rollup circuit.
 */
export class PreviousRollupData {
  constructor(
    /**
     * Public inputs to the base or merge rollup circuit.
     */
    public baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputs,
    /**
     * The proof of the base or merge rollup circuit.
     */
    public proof: RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    /**
     * The verification key and the witness of the vk in the vk tree.
     */
    public vkData: VkData,
  ) {}

  /**
   * Serializes previous rollup data to a buffer.
   * @returns The buffer of the serialized previous rollup data.
   */
  public toBuffer(): Buffer {
    return serializeToBuffer(this.baseOrMergeRollupPublicInputs, this.proof, this.vkData);
  }

  /**
   * Deserializes previous rollup data from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new PreviousRollupData instance.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): PreviousRollupData {
    const reader = BufferReader.asReader(buffer);
    return new PreviousRollupData(
      reader.readObject(BaseOrMergeRollupPublicInputs),
      RecursiveProof.fromBuffer(reader, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      reader.readObject(VkData),
    );
  }
}
