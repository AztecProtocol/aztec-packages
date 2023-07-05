import { Fr } from "@aztec/foundation/fields";
import { Tuple } from "@aztec/foundation/serialize";

/**
 * When a number is larger than the field size (on ethereum we currently utilize 254 bit fields), it must be split
 * into smaller components. 
 * This class exists for the case of 32 byte hashes (256 bits), which are split into two 16 byte components. 
 * A high component and a low component.
 */
export class TwoFieldHash {

    constructor(
        private high: Fr,
        private low: Fr
    ) {}

    /**
     * Returns a two field hash type from a 32 byte hash. 
     * @param hash - Buffer containing the hash.
     * @returns The two field hash.
     */
    public static from32ByteHash(hash: Buffer): TwoFieldHash {
        if (hash.length !== 32) {
            throw new Error("Two Field Hash must be 32 bytes");
        }

        const high = Fr.fromBuffer(hash.subarray(0, 16));
        const low = Fr.fromBuffer(hash.subarray(16, 32));
        return new TwoFieldHash(high, low);
    }

    /**
     * Returns empty object.
     * @returns Empty Hash.
     */
    public static empty(): TwoFieldHash {
        return new TwoFieldHash(Fr.zero(), Fr.zero());
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
     * Serialised as a field array.
     * @returns The two field hash as an fixed size array of field elements.
     */
    public toFieldArray(): Tuple<Fr, 2> {
        return [this.high, this.low];
    }

}