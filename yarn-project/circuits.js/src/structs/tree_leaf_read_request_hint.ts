import { assertMemberLength } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * Contains information which can be used to prove that a leaf is a member of a Merkle tree.
 */
export class TreeLeafReadRequestHint<N extends number> {
  constructor(
    /**
     * Size of the sibling path (number of fields it contains).
     */
    pathSize: N,
    /**
     * Sibling path of the leaf in the Merkle tree.
     */
    public siblingPath: Tuple<Fr, N>,
  ) {
    assertMemberLength(this, 'siblingPath', pathSize);
  }

  toBuffer() {
    return serializeToBuffer(this.siblingPath);
  }

  public static empty<N extends number>(pathSize: N): TreeLeafReadRequestHint<N> {
    const arr = Array(pathSize)
      .fill(0)
      .map(() => Fr.ZERO) as Tuple<Fr, N>;
    return new TreeLeafReadRequestHint<N>(pathSize, arr);
  }

  static fromBuffer<N extends number>(buffer: Buffer | BufferReader, size: N): TreeLeafReadRequestHint<N> {
    const reader = BufferReader.asReader(buffer);
    const siblingPath = reader.readArray(size, Fr);
    return new TreeLeafReadRequestHint(size, siblingPath);
  }
}
