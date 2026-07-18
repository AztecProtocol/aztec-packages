import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class InboxLeaf {
  constructor(
    /** Index of the leaf in the whole tree. */
    public readonly index: bigint,
    /** Leaf in the subtree/message hash. */
    public readonly leaf: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.index, this.leaf]);
  }

  fromBuffer(buffer: Buffer | BufferReader): InboxLeaf {
    const reader = BufferReader.asReader(buffer);
    const index = toBigIntBE(reader.readBytes(32));
    const leaf = reader.readObject(Fr);
    return new InboxLeaf(index, leaf);
  }
}
