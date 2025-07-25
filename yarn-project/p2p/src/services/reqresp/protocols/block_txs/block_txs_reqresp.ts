import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { TxArray, TxHash } from '@aztec/stdlib/tx';

import { BitVector } from './bitvector.js';

/**
 * Request message for requesting specific transactions from a block
 */
export class BlockTxsRequest {
  constructor(
    readonly blockHash: Fr, // 32 byte hash of the proposed block header
    // BitVector indicating which txs from the proposal we are requesting
    // 1 means we want the tx, 0 means we don't
    readonly txIndices: BitVector,
  ) {}

  /**
   * Crates new BlockTxsRequest given proposal and missing tx hashes
   *
   * @param: blockProposal - The block proposal for which we are making request
   * @param: missingTxHashes - Tx hashes from the proposal we are missing
   *
   * @returns undefined if there were no missingTxHashes matching BlockProposal hashes, otherwise
   * returns new BlockTxsRequest*/
  static fromBlockProposalAndMissingTxs(
    blockProposal: BlockProposal,
    missingTxHashes: TxHash[],
  ): BlockTxsRequest | undefined {
    if (missingTxHashes.length === 0) {
      return undefined; // No missing txs to request
    }

    const missingHashesSet = new Set(missingTxHashes);
    const missingIndices = blockProposal.txHashes
      .map((hash, idx) => (missingHashesSet.has(hash) ? idx : -1))
      .filter(i => i != -1);

    if (missingIndices.length === 0) {
      return undefined; // No indices found for missing tx hashes
    }

    const requestBitVector = BitVector.init(blockProposal.txHashes.length, missingIndices);

    return new BlockTxsRequest(blockProposal.archive, requestBitVector);
  }

  /**
   * Deserializes the BlockTxRequest object from a Buffer
   * @param buffer - Buffer or BufferReader object to deserialize
   * @returns An instance of BlockTxRequest
   */
  static fromBuffer(buffer: Buffer | BufferReader): BlockTxsRequest {
    const reader = BufferReader.asReader(buffer);
    const blockHash = Fr.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsRequest(blockHash, txIndices);
  }

  /**
   * Serializes the BlockTxRequest object into a Buffer
   * @returns Buffer representation of the BlockTxRequest object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.blockHash, this.txIndices.toBuffer()]);
  }
}

/**
 * Response message containing requested transactions from a block
 */
export class BlockTxsResponse {
  constructor(
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
    const blockHash = Fr.fromBuffer(reader);
    const txs = TxArray.fromBuffer(reader);
    const txIndices = BitVector.fromBuffer(reader);

    return new BlockTxsResponse(blockHash, txs, txIndices);
  }

  /**
   * Serializes the BlockTxResponse object into a Buffer
   * @dev: In current implementation, txIndices is serialized as Buffer of unknown length,
   * thus we serialize it last
   * @returns Buffer representation of the BlockTxResponse object
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.blockHash, this.txs.toBuffer(), this.txIndices.toBuffer()]);
  }

  static empty(): BlockTxsResponse {
    return new BlockTxsResponse(Fr.ZERO, new TxArray(), BitVector.init(0, []));
  }
}
