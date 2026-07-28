import { z } from 'zod';

import { makeTuple } from '../array/array.js';
import { Fr } from '../curves/bn254/index.js';
import { schemas } from '../schemas/index.js';
import { BufferReader, type Tuple, assertLength, serializeArrayOfBufferableToVector } from '../serialize/index.js';
import { bufferToHex, hexToBuffer } from '../string/index.js';
import type { Hasher } from './hasher.js';

/**
 * Upper bound on the elements a serialized sibling path may declare. The deepest protocol tree is 42 levels,
 * and the stacked path proving L2-to-L1 message inclusion spans four unbalanced trees, so this leaves room to
 * spare while keeping a malformed length prefix from driving a large allocation. `stdlib` asserts that it stays
 * above every protocol tree height, which this package cannot check itself without depending on `@aztec/constants`.
 */
export const MAX_SIBLING_PATH_LENGTH = 128;

/**
 * Contains functionality to compute and serialize/deserialize a sibling path.
 * E.g. Sibling path for a leaf at index 3 in a tree of depth 3 consists of:
 *      d0:                                            [ root ]
 *      d1:                      [ ]                                               [*]
 *      d2:         [*]                      [ ]                       [ ]                     [ ]
 *      d3:   [ ]         [ ]          [*]         [ ]           [ ]         [ ]          [ ]        [ ].
 *
 *      And the elements would be ordered as: [ leaf_at_index_2, node_at_level_2_index_0, node_at_level_1_index_1 ].
 */
export class SiblingPath<N extends number> {
  private data: Tuple<Buffer, N>;

  /**
   * Constructor.
   * @param pathSize - The size of the sibling path.
   * @param path - The sibling path data.
   */
  constructor(
    /** Size of the sibling path (number of fields it contains). */
    public pathSize: N,
    /** The sibling path data. */
    path: Buffer[],
  ) {
    this.data = assertLength(path, pathSize);
  }

  static get schema() {
    return schemas.Buffer.transform(b => SiblingPath.fromBuffer(b));
  }

  static schemaFor<N extends number>(size: N) {
    return schemas.Buffer.transform(b => SiblingPath.fromBuffer(b) as SiblingPath<N>).superRefine((path, ctx) => {
      if (path.pathSize !== size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected sibling path size ${size} but got ${path.pathSize}`,
        });
      }
    });
  }

  toJSON() {
    return this.toBuffer();
  }

  /**
   * Returns sibling path hashed up from the a element.
   * @param size - The number of elements in a given path.
   * @param zeroElement - Value of the zero element.
   * @param hasher - Implementation of a hasher interface.
   * @returns A sibling path hashed up from a zero element.
   */
  public static ZERO<N extends number>(size: N, zeroElement: Buffer, hasher: Hasher): SiblingPath<N> {
    const bufs: Buffer[] = [];
    let current = zeroElement;
    for (let i = 0; i < size; ++i) {
      bufs.push(current);
      current = hasher.hash(current, current);
    }
    return new SiblingPath(size, bufs);
  }

  static random<N extends number>(number: N) {
    const data = Array.from({ length: number }, () => Fr.random().toBuffer());
    return new SiblingPath(number, data);
  }

  /**
   * Serializes this SiblingPath object to a buffer.
   * @returns The buffer representation of this object.
   */
  public toBuffer(): Buffer {
    return serializeArrayOfBufferableToVector(this.data);
  }

  /**
   * Returns the path buffer underlying the sibling path.
   * @returns The Buffer array representation of this object.
   */
  public toBufferArray(): Buffer[] {
    return this.data;
  }

  /**
   * Convert the Sibling Path object into an array of field elements.
   * @returns The field array representation of this object.
   */
  public toFields(): Fr[] {
    return this.data.map(buf => Fr.fromBuffer(buf));
  }

  /**
   * Convert Sibling Path object into a tuple of field elements.
   * @returns A tuple representation of the sibling path.
   */
  public toTuple(): Tuple<Fr, N> {
    const array = this.toFields();
    return makeTuple(array.length as N, i => array[i], 0);
  }

  /**
   * Deserializes a SiblingPath from a buffer.
   * @param buf - A buffer containing the buffer representation of SiblingPath.
   * @param offset - An offset to start deserializing from.
   * @returns A SiblingPath object.
   * @throws If the length prefix exceeds MAX_SIBLING_PATH_LENGTH or the buffer holds fewer elements than it declares.
   */
  static fromBuffer<N extends number>(buf: Buffer, offset = 0): SiblingPath<N> {
    const reader = new BufferReader(buf, offset);
    const path = reader.readVector({ fromBuffer: r => r.readBytes(Fr.SIZE_IN_BYTES) }, MAX_SIBLING_PATH_LENGTH);
    return new SiblingPath<N>(path.length as N, path);
  }

  /**
   * Serializes this SiblingPath object to a hex string representation.
   * @returns A hex string representation of the sibling path.
   */
  public toString(): string {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes a SiblingPath object from a hex string representation.
   * @param repr - A hex string representation of the sibling path.
   * @returns A SiblingPath object.
   */
  public static fromString<N extends number>(repr: string): SiblingPath<N> {
    return SiblingPath.fromBuffer<N>(hexToBuffer(repr));
  }

  /**
   * Generate a subtree path from the current sibling path.
   * @param subtreeHeight - The size of the subtree that we are getting the path for.
   * @returns A new sibling path that is the for the requested subtree.
   */
  public getSubtreeSiblingPath<SubtreeHeight extends number, SubtreeSiblingPathHeight extends number>(
    subtreeHeight: SubtreeHeight,
  ): SiblingPath<SubtreeSiblingPathHeight> {
    // Drop the size of the subtree from the path, and return the rest.
    const subtreeData = this.data.slice(subtreeHeight);
    const subtreePathSize = (this.pathSize - subtreeHeight) as SubtreeSiblingPathHeight;
    return new SiblingPath(subtreePathSize, subtreeData);
  }
}

/** Computes the expected root of a merkle tree given a leaf and its sibling path. */
export async function computeRootFromSiblingPath(
  leaf: Buffer,
  siblingPath: Buffer[],
  index: number,
  hasher: (left: Buffer, right: Buffer) => Promise<Buffer>,
) {
  let result = leaf;
  for (const sibling of siblingPath) {
    result = index & 1 ? await hasher(sibling, result) : await hasher(result, sibling);
    index >>= 1;
  }
  return result;
}
