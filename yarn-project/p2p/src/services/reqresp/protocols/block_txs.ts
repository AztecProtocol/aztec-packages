import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { TxArray } from '@aztec/stdlib/tx';

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

/**
 * Request message for requesting specific transactions from a block
 */
export class BlockTxsRequest {
  constructor(
    readonly blockNumber: number,
    readonly blockHash: Fr, // 32 byte hash of the proposed block header
    // BitVector indicating which txs from the proposal we are requesting
    // 1 means we want the tx, 0 means we don't
    readonly txIndices: BitVector,
  ) {}

  /**
   * Deserializes the BlockTxRequest object from a Buffer
   * @param buffer - Buffer or BufferReader object to deserialize
   * @returns An instance of BlockTxRequest
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockTxsRequest {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = reader.readNumber();
    const blockHash = Fr.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsRequest(blockNumber, blockHash, txIndices);
  }

  /**
   * Serializes the BlockTxRequest object into a Buffer
   * @returns Buffer representation of the BlockTxRequest object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.blockNumber, this.blockHash, this.txIndices.toBuffer()]);
  }
}

/**
 * Response message containing requested transactions from a block
 */
export class BlockTxsResponse {
  constructor(
    readonly blockNumber: number,
    readonly blockHash: Fr,
    readonly txs: TxArray, // List of transactions we requested and peer has
    // BitVector indicating which txs from the proposal are available at the peer
    // 1 means the tx is available, 0 means it is not
    readonly txIndices: BitVector,
  ) {}

  /**
   * Deserializes the BlockTxResponse object from a Buffer
   * @param buffer - Buffer or BufferReader object to deserialize
   * @returns An instance of BlockTxResponse
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockTxsResponse {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = reader.readNumber();
    const blockHash = Fr.fromBuffer(reader);
    const txs = TxArray.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsResponse(blockNumber, blockHash, txs, txIndices);
  }

  /**
   * Serializes the BlockTxResponse object into a Buffer
   * @dev: In current implementation, txIndices is serialized as Buffer of unknown length,
   * thus we serialize it last
   * @returns Buffer representation of the BlockTxResponse object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.blockNumber, this.blockHash, this.txs.toBuffer(), this.txIndices.toBuffer()]);
  }

  static empty(): BlockTxsResponse {
    return new BlockTxsResponse(0, Fr.ZERO, new TxArray(), BitVector.init(0, []));
  }
}
