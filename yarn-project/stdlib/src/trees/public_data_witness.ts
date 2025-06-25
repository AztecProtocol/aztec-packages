import { PUBLIC_DATA_TREE_HEIGHT } from '@aztec/constants';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import { PublicDataTreeLeafPreimage } from './public_data_leaf.js';

/**
 * Public data witness.
 * @remarks This allows to prove either:
 * - That a slot in the public data tree is empty (0 value) if it falls within the range of the leaf.
 * - The current value of a slot in the public data tree if it matches exactly the slot of the leaf.
 */
export class PublicDataWitness {
  constructor(
    /**
     * The index of the leaf in the public data tree.
     */
    public readonly index: bigint,
    /**
     * Preimage of a low leaf. All the slots in the range of the leaf are empty, and the current value of the
     * leaf slot is stored in the leaf.
     */
    public readonly leafPreimage: PublicDataTreeLeafPreimage,
    /**
     * Sibling path to prove membership of the leaf.
     */
    public readonly siblingPath: SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>,
  ) {}

  static get schema() {
    return z
      .object({
        index: schemas.BigInt,
        leafPreimage: PublicDataTreeLeafPreimage.schema,
        siblingPath: SiblingPath.schemaFor(PUBLIC_DATA_TREE_HEIGHT),
      })
      .transform(({ index, leafPreimage, siblingPath }) => new PublicDataWitness(index, leafPreimage, siblingPath));
  }

  /**
   * Returns a field array representation of a public data witness.
   * @returns A field array representation of a public data witness.
   */
  public toFields(): Fr[] {
    return [
      new Fr(this.index),
      new Fr(this.leafPreimage.leaf.slot),
      new Fr(this.leafPreimage.leaf.value),
      new Fr(this.leafPreimage.nextIndex),
      new Fr(this.leafPreimage.nextKey),
      ...this.siblingPath.toFields(),
    ];
  }

  /**
   * Returns a representation of the public data witness as expected by intrinsic Noir deserialization.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    return [
      new Fr(this.index).toString() as string,
      new Fr(this.leafPreimage.leaf.slot).toString() as string,
      new Fr(this.leafPreimage.leaf.value).toString() as string,
      new Fr(this.leafPreimage.nextKey).toString() as string,
      new Fr(this.leafPreimage.nextIndex).toString() as string,
      this.siblingPath.toFields().map(fr => fr.toString()) as string[],
    ];
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.index, this.leafPreimage, this.siblingPath]);
  }

  /**
   * Returns a string representation of the TxEffect object.
   */
  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static random() {
    return new PublicDataWitness(
      BigInt(Math.floor(Math.random() * 1000)),
      PublicDataTreeLeafPreimage.random(),
      SiblingPath.random(PUBLIC_DATA_TREE_HEIGHT),
    );
  }

  public withoutPreimage(): MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT> {
    return new MembershipWitness(PUBLIC_DATA_TREE_HEIGHT, this.index, this.siblingPath.toTuple());
  }

  /**
   * Deserializes an PublicDataWitness object from a buffer.
   * @param buf - Buffer or BufferReader to deserialize.
   * @returns An instance of PublicDataWitness.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicDataWitness {
    const reader = BufferReader.asReader(buffer);

    return new PublicDataWitness(
      toBigIntBE(reader.readBytes(32)),
      reader.readObject(PublicDataTreeLeafPreimage),
      SiblingPath.fromBuffer(reader.readBytes(4 + 32 * PUBLIC_DATA_TREE_HEIGHT)),
    );
  }

  /**
   * Deserializes an PublicDataWitness object from a string.
   * @param str - String to deserialize.
   * @returns An instance of PublicDataWitness.
   */
  static fromString(str: string) {
    return PublicDataWitness.fromBuffer(hexToBuffer(str));
  }
}
