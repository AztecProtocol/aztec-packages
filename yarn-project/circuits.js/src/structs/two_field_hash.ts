import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { Tuple } from '@aztec/foundation/serialize';

/**
 * When a number is larger than the field size (on ethereum we currently utilize 254 bit fields), it must be split
 * into smaller components.
 * This class exists for the case of 32 byte hashes (256 bits), which are split into two 16 byte components.
 * A high component and a low component.
 */
export class TwoFieldHash {
  constructor(
    /** The high 16 bytes of the hash as a field element. */
    public readonly high: Fr,
    /** The low 16 bytes of the hash as a field element. */
    public readonly low: Fr,
  ) {}

  /**
   * Returns a two field hash type from a 32 byte hash.
   * @param hash - Buffer containing the hash.
   * @returns The two field hash.
   */
  public static from32ByteHash(hash: Buffer): TwoFieldHash {
    if (hash.length !== 32) {
      throw new Error('Two Field Hash must be 32 bytes');
    }

    const high = Fr.fromBuffer(hash.subarray(0, 16));
    const low = Fr.fromBuffer(hash.subarray(16, 32));
    return new TwoFieldHash(high, low);
  }

  /**
   * Returns a two field hash type from a Bigint.
   * @param hash - Bigint containing the hash.
   * @returns The two field hash.
   */
  public static fromBigInt(hash: bigint): TwoFieldHash {
    const hashBuffer = Buffer.alloc(32);
    hashBuffer.writeBigInt64BE(hash);

    return TwoFieldHash.from32ByteHash(hashBuffer);
  }

  /**
   * Returns empty object.
   * @returns Empty Hash.
   */
  public static empty(): TwoFieldHash {
    return new TwoFieldHash(Fr.zero(), Fr.zero());
  }

  /**
   * Returns a random object.
   * @returns Empty Hash.
   */
  public static random(): TwoFieldHash {
    const r = randomBytes(Fr.SIZE_IN_BYTES);
    return TwoFieldHash.from32ByteHash(r);
  }

  /**
   * Serialised as a Buffer array.
   * @returns The two field hash as an array of Buffers.
   */
  public toBufferArray(): Tuple<Buffer, 2> {
    return [this.high.toBuffer(), this.low.toBuffer()];
  }

  /**
   * Converts the value of the instance to a buffer with a specified length.
   * The method uses the provided value and size in bytes to create a buffer representation
   * of the numeric value. This can be useful for serialization and communication purposes.
   *
   * @returns A buffer representing the instance's value.
   */
  toBuffer() {
    return Buffer.concat(this.toBufferArray());
  }

  /**
   * Converts the value into a 32 byte buffer.
   * @returns The two field hash as a 32 byte buffer.
   */
  toBufferPacked() {
    const buf = Buffer.alloc(32, 0);
    const ba = this.toBufferArray();

    // Place the high value in the first 16 bytes
    ba[0].copy(buf, 0, 16, 32);
    ba[1].copy(buf, 16, 16, 32);
    return buf;
  }

  /**
   * Serialised as a field array.
   * @returns The two field hash as an fixed size array of field elements.
   */
  public toFieldArray(): Tuple<Fr, 2> {
    return [this.high, this.low];
  }
}
