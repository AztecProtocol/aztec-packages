import { BufferReader, Fr } from '@aztec/foundation';
import { serializeToBuffer } from '../../utils/serialize.js';
import { TxContext } from '../tx_context.js';

export class PrivateOldTreeRoots {
  constructor(
    public privateDataTreeRoot: Fr,
    public nullifierTreeRoot: Fr,
    public contractTreeRoot: Fr,
    public privateKernelVkTreeRoot: Fr, // future enhancement
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.privateDataTreeRoot,
      this.nullifierTreeRoot,
      this.contractTreeRoot,
      this.privateKernelVkTreeRoot,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateOldTreeRoots {
    const reader = BufferReader.asReader(buffer);
    return new PrivateOldTreeRoots(reader.readFr(), reader.readFr(), reader.readFr(), reader.readFr());
  }

  static empty() {
    return new PrivateOldTreeRoots(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}

export class CombinedOldTreeRoots {
  constructor(public readonly privateOldTreeRoots: PrivateOldTreeRoots, public readonly publicDataTreeRoot: Fr) {}

  toBuffer() {
    return serializeToBuffer(this.privateOldTreeRoots, this.publicDataTreeRoot);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CombinedOldTreeRoots(reader.readObject(PrivateOldTreeRoots), reader.readFr());
  }

  static empty() {
    return new CombinedOldTreeRoots(PrivateOldTreeRoots.empty(), Fr.ZERO);
  }
}

export class CombinedConstantData {
  constructor(public oldTreeRoots: CombinedOldTreeRoots, public txContext: TxContext) {}

  toBuffer() {
    return serializeToBuffer(this.oldTreeRoots, this.txContext);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedConstantData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedConstantData(reader.readObject(CombinedOldTreeRoots), reader.readObject(TxContext));
  }

  static empty() {
    return new CombinedConstantData(CombinedOldTreeRoots.empty(), TxContext.empty());
  }
}
