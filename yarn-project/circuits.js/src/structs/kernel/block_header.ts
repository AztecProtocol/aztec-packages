import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { GeneratorIndex } from '../../index.js';
import { FieldsOf } from '../../utils/jsUtils.js';
import { serializeToBuffer } from '../../utils/serialize.js';

/**
 * The string encoding used for serializing BlockHeader objects.
 */
const STRING_ENCODING: BufferEncoding = 'hex';

/**
 * Information about the tree roots used for both public and private kernels.
 */
export class BlockHeader {
  constructor(
    /**
     * Root of the blocks tree at the time of when this information was assembled.
     * @remarks Tree root of the parent block's blocks tree - we don't have this block's blocks tree root here because
     * to update the tree we first need to form this object and compute its hash.
     */
    public parentBlockBlocksTreeRoot: Fr,
    /**
     * Root of the note hash tree at the time of when this information was assembled.
     */
    public noteHashTreeRoot: Fr,
    /**
     * Root of the nullifier tree at the time of when this information was assembled.
     */
    public nullifierTreeRoot: Fr,
    /**
     * Root of the contract tree at the time of when this information was assembled.
     */
    public contractTreeRoot: Fr,
    /**
     * Root of the l1 to l2 messages tree at the time of when this information was assembled.
     */
    public l1ToL2MessagesTreeRoot: Fr,
    /**
     * Root of the private kernel vk tree at the time of when this information was assembled.
     */
    public privateKernelVkTreeRoot: Fr,
    /**
     * Current public state tree hash.
     */
    public publicDataTreeRoot: Fr,
    /**
     * Previous globals hash, this value is used to recalculate the block hash.
     */
    public globalVariablesHash: Fr,
  ) {}

  static from(fields: FieldsOf<BlockHeader>) {
    return new BlockHeader(...BlockHeader.getFields(fields));
  }

  static random() {
    return new BlockHeader(
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
    );
  }

  static getFields(fields: FieldsOf<BlockHeader>) {
    return [
      fields.parentBlockBlocksTreeRoot,
      fields.noteHashTreeRoot,
      fields.nullifierTreeRoot,
      fields.contractTreeRoot,
      fields.l1ToL2MessagesTreeRoot,
      fields.privateKernelVkTreeRoot,
      fields.publicDataTreeRoot,
      fields.globalVariablesHash,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockHeader.getFields(this));
  }

  toString() {
    // originally this was encoding as utf-8 (the default). This caused problems decoding back the data.
    return this.toBuffer().toString(STRING_ENCODING);
  }

  /**
   * Return the block header as an array of items in the order they are serialized in noir.
   * @returns Array of items in the order they are stored in the contract
   */
  toArray(): Fr[] {
    return [
      this.parentBlockBlocksTreeRoot,
      this.noteHashTreeRoot,
      this.nullifierTreeRoot,
      this.contractTreeRoot,
      this.l1ToL2MessagesTreeRoot,
      this.privateKernelVkTreeRoot,
      this.publicDataTreeRoot,
      this.globalVariablesHash,
    ];
  }

  // TODO: cache this
  blockHash(): Fr {
    const inputs = this.toArray().map(fr => fr.toBuffer());
    return Fr.fromBuffer(pedersenHash(inputs, GeneratorIndex.BLOCK_HASH));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockHeader(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  static fromString(str: string) {
    return BlockHeader.fromBuffer(Buffer.from(str, STRING_ENCODING));
  }

  isEmpty() {
    return this.toArray().every(fr => fr.isZero());
  }

  static empty() {
    return new BlockHeader(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}
