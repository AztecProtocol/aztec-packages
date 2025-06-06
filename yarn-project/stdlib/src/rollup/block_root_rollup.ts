import { BlobAccumulatorPublicInputs, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import {
  ARCHIVE_HEIGHT,
  BLOBS_PER_BLOCK,
  FIELDS_PER_BLOB,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';
import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { RootParityInput } from '../parity/root_parity_input.js';
import { BlockHeader } from '../tx/block_header.js';
import { PreviousRollupData } from './previous_rollup_data.js';

export class BlockRootRollupData {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public l1ToL2Roots: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    /**
     * Hint for inserting the new l1 to l2 message subtree.
     */
    public l1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Hint for checking the hash of previous_block_header is the last leaf of the previous archive.
     */
    public previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    /**
     * The header of the previous block.
     */
    public previousBlockHeader: BlockHeader,
    /**
     * The current blob accumulation state across the epoch.
     */
    public startBlobAccumulator: BlobAccumulatorPublicInputs,
    /**
     * Finalized challenges z and gamma for performing blob batching. Shared value across the epoch.
     */
    public finalBlobChallenges: FinalBlobBatchingChallenges,
    /**
     * Identifier of the prover.
     */
    public proverId: Fr,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...BlockRootRollupData.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupInputs instance.
   */
  static from(fields: FieldsOf<BlockRootRollupData>): BlockRootRollupData {
    return new BlockRootRollupData(...BlockRootRollupData.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<BlockRootRollupData>) {
    return [
      fields.l1ToL2Roots,
      fields.l1ToL2MessageSubtreeSiblingPath,
      fields.previousArchiveSiblingPath,
      fields.newArchiveSiblingPath,
      fields.previousBlockHeader,
      fields.startBlobAccumulator,
      fields.finalBlobChallenges,
      fields.proverId,
    ] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockRootRollupData {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupData(
      RootParityInput.fromBuffer(reader, NESTED_RECURSIVE_PROOF_LENGTH),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      BlockHeader.fromBuffer(reader),
      reader.readObject(BlobAccumulatorPublicInputs),
      reader.readObject(FinalBlobBatchingChallenges),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromString(str: string) {
    return BlockRootRollupData.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BlockRootRollupData);
  }
}

export class BlockRootRollupBlobData {
  constructor(
    /**
     * Flat list of all tx effects which will be added to the blob.
     * Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
     * Tuple<Fr, FIELDS_PER_BLOB * BLOBS_PER_BLOCK>
     */
    public blobFields: Fr[],
    /**
     * KZG commitments representing the blob (precomputed in ts, injected to use inside circuit).
     */
    public blobCommitments: Tuple<BLS12Point, typeof BLOBS_PER_BLOCK>,
    /**
     * The hash of eth blob hashes for this block
     * See yarn-project/foundation/src/blob/index.ts or body.ts for calculation
     */
    public blobsHash: Fr,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...BlockRootRollupBlobData.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupInputs instance.
   */
  static from(fields: FieldsOf<BlockRootRollupBlobData>): BlockRootRollupBlobData {
    return new BlockRootRollupBlobData(...BlockRootRollupBlobData.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<BlockRootRollupBlobData>) {
    return [fields.blobFields, fields.blobCommitments, fields.blobsHash] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockRootRollupBlobData {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupBlobData(
      // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
      // reader.readArray(FIELDS_PER_BLOB, Fr),
      Array.from({ length: FIELDS_PER_BLOB * BLOBS_PER_BLOCK }, () => Fr.fromBuffer(reader)),
      reader.readArray(BLOBS_PER_BLOCK, BLS12Point),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromString(str: string) {
    return BlockRootRollupBlobData.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BlockRootRollupBlobData);
  }
}

/**
 * Represents inputs of the block root rollup circuit.
 */
export class BlockRootRollupInputs {
  constructor(
    /**
     * The previous rollup data from 2 merge or base rollup circuits.
     */
    public previousRollupData: [PreviousRollupData, PreviousRollupData],
    public data: BlockRootRollupData,
    public blobData: BlockRootRollupBlobData,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...BlockRootRollupInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupInputs instance.
   */
  static from(fields: FieldsOf<BlockRootRollupInputs>): BlockRootRollupInputs {
    return new BlockRootRollupInputs(...BlockRootRollupInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<BlockRootRollupInputs>) {
    return [fields.previousRollupData, fields.data, fields.blobData] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockRootRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupInputs(
      [reader.readObject(PreviousRollupData), reader.readObject(PreviousRollupData)],
      reader.readObject(BlockRootRollupData),
      reader.readObject(BlockRootRollupBlobData),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromString(str: string) {
    return BlockRootRollupInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BlockRootRollupInputs);
  }
}

export class SingleTxBlockRootRollupInputs {
  constructor(
    public previousRollupData: [PreviousRollupData],
    public data: BlockRootRollupData,
    public blobData: BlockRootRollupBlobData,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...SingleTxBlockRootRollupInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupInputs instance.
   */
  static from(fields: FieldsOf<SingleTxBlockRootRollupInputs>): SingleTxBlockRootRollupInputs {
    return new SingleTxBlockRootRollupInputs(...SingleTxBlockRootRollupInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<SingleTxBlockRootRollupInputs>) {
    return [fields.previousRollupData, fields.data, fields.blobData] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SingleTxBlockRootRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new SingleTxBlockRootRollupInputs(
      [reader.readObject(PreviousRollupData)],
      reader.readObject(BlockRootRollupData),
      reader.readObject(BlockRootRollupBlobData),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromString(str: string) {
    return SingleTxBlockRootRollupInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(SingleTxBlockRootRollupInputs);
  }
}
