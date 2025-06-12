import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { schemas } from '../schemas/index.js';

/**
 * A class representing hash of Aztec transaction.
 * @dev Computed by hashing the public inputs of the private kernel tail circuit (see Tx::getTxHash function).
 */
export class TxHash {
  constructor(
    /** A field representing the tx hash (tx hash is an output of poseidon hash hence it's a field). */
    public readonly hash: Fr,
  ) {}

  static random() {
    return new TxHash(Fr.random());
  }

  static fromBuffer(buffer: Uint8Array | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(reader.readObject(Fr));
  }

  static fromString(str: string) {
    return new TxHash(Fr.fromString(str));
  }

  static fromBigInt(value: bigint) {
    return new TxHash(new Fr(value));
  }

  static fromField(value: Fr) {
    return new TxHash(value);
  }

  public toBuffer() {
    return this.hash.toBuffer();
  }

  public toString() {
    return this.hash.toString();
  }

  public toBigInt() {
    return this.hash.toBigInt();
  }

  toJSON() {
    return this.toString();
  }

  public equals(other: TxHash) {
    return this.hash.equals(other.hash);
  }

  static get schema() {
    return schemas.BufferHex.transform(value => new TxHash(Fr.fromBuffer(value)));
  }

  static zero() {
    return new TxHash(Fr.ZERO);
  }

  static get SIZE() {
    return Fr.SIZE_IN_BYTES;
  }
}
