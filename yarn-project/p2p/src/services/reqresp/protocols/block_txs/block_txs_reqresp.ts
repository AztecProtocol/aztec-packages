import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { TxArray, type TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { BitVector } from './bitvector.js';

/** Minimal interface for a block source that provides tx hashes and an archive root. */
export interface BlockTxsSource {
  txHashes: TxHash[];
  archive: Fr;
}

/**
 * Request message for requesting specific transactions from a block
 */
export class BlockTxsRequest {
  constructor(
    // Archive root after the proposed block is applied (proposal identifier)
    readonly archiveRoot: Fr,
    // Hashes of txs we are requesting
    readonly txHashes: TxHashArray,
    // BitVector indicating which txs from the proposal we are requesting
    // 1 means we want the tx, 0 means we don't
    // If we know peer has the Block Proposal then we can use this BitVector
    // Otherwise we can use this optimization
    readonly txIndices: BitVector,
  ) {}

  /**
   * Creates new BlockTxsRequest given a block txs source and missing tx hashes.
   *
   * @param blockTxsSource - The block or proposal for which we are making the request
   * @param missingTxHashes - Tx hashes from the source we are missing
   * @param includeFullTxHashes - Whether to include full list of missing tx hashes in the request or just Bitvector indices
   *
   * @returns undefined if there were no missingTxHashes matching the source hashes, otherwise
   * returns new BlockTxsRequest
   */
  static fromTxsSourceAndMissingTxs(
    blockTxsSource: BlockTxsSource,
    missingTxHashes: TxHash[],
    includeFullTxHashes = false,
  ): BlockTxsRequest | undefined {
    if (missingTxHashes.length === 0) {
      return undefined; // No missing txs to request
    }

    const missingHashesSet = new Set(missingTxHashes.map(t => t.toString()));

    // We cannot request txs that are not part of the block
    if (!missingHashesSet.isSubsetOf(new Set(blockTxsSource.txHashes.map(t => t.toString())))) {
      return undefined;
    }

    const missingIndices = blockTxsSource.txHashes
      .map((hash, idx) => (missingHashesSet.has(hash.toString()) ? idx : -1))
      .filter(i => i != -1);

    const requestBitVector = BitVector.init(blockTxsSource.txHashes.length, missingIndices);
    const hashes = includeFullTxHashes ? new TxHashArray(...missingTxHashes) : new TxHashArray();

    return new BlockTxsRequest(blockTxsSource.archive, hashes, requestBitVector);
  }

  /**
   * Deserializes the BlockTxRequest object from a Buffer
   * @param buffer - Buffer or BufferReader object to deserialize
   * @returns An instance of BlockTxRequest
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockTxsRequest {
    const reader = BufferReader.asReader(buffer);
    const archiveRoot = Fr.fromBuffer(reader);
    const txHashes = TxHashArray.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsRequest(archiveRoot, txHashes, txIndices);
  }

  /**
   * Serializes the BlockTxRequest object into a Buffer
   * @returns Buffer representation of the BlockTxRequest object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.archiveRoot, this.txHashes.toBuffer(), this.txIndices.toBuffer()]);
  }
}

/**
 * Response message containing requested transactions from a block
 */
export class BlockTxsResponse {
  constructor(
    readonly archiveRoot: Fr,
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
    const archiveRoot = Fr.fromBuffer(reader);
    const txs = TxArray.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsResponse(archiveRoot, txs, txIndices);
  }

  /**
   * Serializes the BlockTxResponse object into a Buffer
   * @dev: In current implementation, txIndices is serialized as Buffer of unknown length,
   * thus we serialize it last
   * @returns Buffer representation of the BlockTxResponse object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.archiveRoot, this.txs.toBuffer(), this.txIndices.toBuffer()]);
  }

  static empty(): BlockTxsResponse {
    return new BlockTxsResponse(Fr.ZERO, new TxArray(), BitVector.init(0, []));
  }
}
