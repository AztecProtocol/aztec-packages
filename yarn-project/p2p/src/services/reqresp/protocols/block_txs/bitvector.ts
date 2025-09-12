import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * BitVector helper class for representing and serializing bit vectors
 */
export class BitVector {
  private buffer: Buffer;
  private length: number;

  constructor(buffer: Buffer, length: number) {
    this.buffer = buffer;
    this.length = length;
  }

  /*
   * Creates new BitVector instance
   * @param length - Length of the bit vector
   * @param indices - Array of indices to set to 1 in the bit vector
   *
   * @returns A new BitVector instance with specified length and set indices
   * */
  static init(length: number, indices: number[]): BitVector {
    if (indices.length > length) {
      throw new Error('Indices length exceeds specified length');
    }

    const buffer = Buffer.alloc(BitVector.byteLength(length));

    indices.forEach(idx => {
      const invalidIndex = idx < 0 || idx >= length;
      if (invalidIndex) {
        throw new Error(`Index ${idx} is out of bounds for BitVector of length ${length}`);
      }

      const byteIndex = Math.floor(idx / 8);
      const bitIndex = idx % 8;
      buffer[byteIndex] |= 1 << bitIndex;
    });

    return new BitVector(buffer, length);
  }

  getLength(): number {
    return this.length;
  }

  /*
   * Checks if element at index is set to true
   *
   * @param index - Index of the bit to check
   *
   * @returns True if the bit at index is set, false otherwise
   * */
  isSet(index: number): boolean {
    return index >= 0 && index < this.length && !!(this.buffer[Math.floor(index / 8)] & (1 << index % 8));
  }

  /**
   * Returns all indices which are set to true
   * */
  getTrueIndices(): number[] {
    return Array.from({ length: this.length }, (_, i) => i).filter(i => this.isSet(i));
  }

  /**
   * Serializes the BitVector object into a Buffer
   *
   * @returns Buffer representation of the BitVector object
   * */
  toBuffer(): Buffer {
    return serializeToBuffer([this.length, this.buffer]);
  }

  /**
   * Deserializes buffer into new BitVector
   *
   * @returns A new BitVector instance
   * */
  static fromBuffer(buffer: Buffer | BufferReader): BitVector {
    const reader = BufferReader.asReader(buffer);
    const length = reader.readNumber();

    const bitBuffer = reader.readBytes(BitVector.byteLength(length));
    return new BitVector(bitBuffer, length);
  }

  static byteLength(length: number) {
    return Math.ceil(length / 8);
  }
}
