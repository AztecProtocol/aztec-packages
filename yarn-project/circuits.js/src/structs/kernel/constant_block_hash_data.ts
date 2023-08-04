import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { FieldsOf } from '../../utils/jsUtils.js';
import { serializeToBuffer } from '../../utils/serialize.js';

/**
 * Encapsulates the roots of all the trees relevant for the kernel circuits.
 */
export class PrivateHistoricTreeRoots {
  constructor(
    /**
     * Root of the private data tree at the time of when this information was assembled.
     */
    public privateDataTreeRoot: Fr,
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
     * Root of the historic blocks tree at the time of when this information was assembled.
     */
    public blocksTreeRoot: Fr,
    /**
     * Root of the private kernel vk tree at the time of when this information was assembled.
     */
    public privateKernelVkTreeRoot: Fr, // future enhancement
  ) {}

  static from(fields: FieldsOf<PrivateHistoricTreeRoots>): PrivateHistoricTreeRoots {
    return new PrivateHistoricTreeRoots(...PrivateHistoricTreeRoots.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateHistoricTreeRoots>) {
    return [
      fields.privateDataTreeRoot,
      fields.nullifierTreeRoot,
      fields.contractTreeRoot,
      fields.l1ToL2MessagesTreeRoot,
      fields.blocksTreeRoot,
      fields.privateKernelVkTreeRoot,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...PrivateHistoricTreeRoots.getFields(this));
  }

  toString() {
    return this.toBuffer().toString();
  }

  isEmpty() {
    return (
      this.privateDataTreeRoot.isZero() &&
      this.nullifierTreeRoot.isZero() &&
      this.contractTreeRoot.isZero() &&
      this.l1ToL2MessagesTreeRoot.isZero() &&
      this.blocksTreeRoot.isZero() &&
      this.privateKernelVkTreeRoot.isZero()
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PrivateHistoricTreeRoots.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateHistoricTreeRoots {
    const reader = BufferReader.asReader(buffer);
    return new PrivateHistoricTreeRoots(
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
    );
  }

  static fromString(str: string): PrivateHistoricTreeRoots {
    return PrivateHistoricTreeRoots.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new PrivateHistoricTreeRoots(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}

/**
 * Information about the tree roots used for both public and private kernels.
 */
export class ConstantBlockHashData {
  constructor(
    /**
     * Root of the trees relevant for kernel circuits.
     */
    public readonly privateHistoricTreeRoots: PrivateHistoricTreeRoots,
    /**
     * Current public state tree hash.
     */
    public readonly publicDataTreeRoot: Fr,
    /**
     * Previous globals hash, this value is used to recalculate the block hash.
     */
    public readonly prevGlobalVariablesHash: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.privateHistoricTreeRoots, this.publicDataTreeRoot, this.prevGlobalVariablesHash);
  }

  toString() {
    return this.toBuffer().toString();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ConstantBlockHashData(reader.readObject(PrivateHistoricTreeRoots), reader.readFr(), reader.readFr());
  }

  isEmpty() {
    return (
      this.privateHistoricTreeRoots.isEmpty() &&
      this.publicDataTreeRoot.isZero() &&
      this.prevGlobalVariablesHash.isZero()
    );
  }

  static empty() {
    return new ConstantBlockHashData(PrivateHistoricTreeRoots.empty(), Fr.ZERO, Fr.ZERO);
  }
}
