import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { RecursiveProof } from '../proofs/recursive_proof.js';
import { VkData } from '../vks/index.js';
import { BlockRootOrBlockMergePublicInputs } from './block_root_or_block_merge_public_inputs.js';

/**
 * Represents the data of a previous block merge or block root rollup circuit.
 */
export class PreviousRollupBlockData {
  constructor(
    /**
     * Public inputs to the block merge or block root rollup circuit.
     */
    public blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputs,
    /**
     * The proof of the block merge or block root rollup circuit.
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
    return serializeToBuffer(this.blockRootOrBlockMergePublicInputs, this.proof, this.vkData);
  }

  /**
   * Deserializes previous rollup data from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new PreviousRollupData instance.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): PreviousRollupBlockData {
    const reader = BufferReader.asReader(buffer);
    return new PreviousRollupBlockData(
      reader.readObject(BlockRootOrBlockMergePublicInputs),
      RecursiveProof.fromBuffer(reader, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      reader.readObject(VkData),
    );
  }
}
