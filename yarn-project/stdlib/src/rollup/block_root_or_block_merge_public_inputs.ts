import { BlockBlobPublicInputs } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { GlobalVariables } from '../tx/global_variables.js';
import { EpochConstantData } from './epoch_constant_data.js';

/**
 * Output of the block root and block merge rollup circuits.
 */
export class BlockRootOrBlockMergePublicInputs {
  constructor(
    /**
     * Constants for the entire epoch.
     */
    public constants: EpochConstantData,
    /**
     * Archive tree immediately before this block range.
     */
    public previousArchive: AppendOnlyTreeSnapshot,
    /**
     * Archive tree after adding this block range.
     */
    public newArchive: AppendOnlyTreeSnapshot,
    /**
     * Global variables for the first block in the range.
     */
    public startGlobalVariables: GlobalVariables,
    /**
     * Global variables for the last block in the range.
     */
    public endGlobalVariables: GlobalVariables,
    /**
     * SHA256 hash of L2 to L1 messages. Used to make public inputs constant-sized (to then be opened on-chain).
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public outHash: Fr,
    /**
     * The hashes of the proposed block headers of the constituent blocks.
     */
    public proposedBlockHeaderHashes: Tuple<Fr, typeof AZTEC_MAX_EPOCH_DURATION>,
    /**
     * The summed `transaction_fee`s and recipients of the constituent blocks.
     */
    public fees: Tuple<FeeRecipient, typeof AZTEC_MAX_EPOCH_DURATION>,
    /**
     * Public inputs required to verify a blob (challenge point z, evaluation y = p(z), and the commitment to p() for each blob)
     */
    public blobPublicInputs: Tuple<BlockBlobPublicInputs, typeof AZTEC_MAX_EPOCH_DURATION>,
  ) {}

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized public inputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockRootOrBlockMergePublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootOrBlockMergePublicInputs(
      reader.readObject(EpochConstantData),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(GlobalVariables),
      reader.readObject(GlobalVariables),
      Fr.fromBuffer(reader),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, Fr),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, FeeRecipient),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, BlockBlobPublicInputs),
    );
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.previousArchive,
      this.newArchive,
      this.startGlobalVariables,
      this.endGlobalVariables,
      this.outHash,
      this.proposedBlockHeaderHashes,
      this.fees,
      this.blobPublicInputs,
    );
  }

  /**
   * Serialize this as a hex string.
   * @returns - The hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new BaseOrMergeRollupPublicInputs instance.
   */
  static fromString(str: string) {
    return BlockRootOrBlockMergePublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BlockRootOrBlockMergePublicInputs);
  }
}

export class FeeRecipient {
  constructor(
    public recipient: EthAddress,
    public value: Fr,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): FeeRecipient {
    const reader = BufferReader.asReader(buffer);
    return new FeeRecipient(reader.readObject(EthAddress), Fr.fromBuffer(reader));
  }

  toBuffer() {
    return serializeToBuffer(this.recipient, this.value);
  }

  static getFields(fields: FieldsOf<FeeRecipient>) {
    return [fields.recipient, fields.value] as const;
  }

  toFields() {
    return serializeToFields(...FeeRecipient.getFields(this));
  }

  isEmpty() {
    return this.value.isZero() && this.recipient.isZero();
  }

  toFriendlyJSON() {
    if (this.isEmpty()) {
      return {};
    }
    return { recipient: this.recipient.toString(), value: this.value.toString() };
  }

  static random() {
    return new FeeRecipient(EthAddress.random(), Fr.random());
  }
}
