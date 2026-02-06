import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { BlockHash } from '../block/block_hash.js';
import { schemas } from '../schemas/index.js';
import { TxHash } from '../tx/tx_hash.js';

/** A globally unique log id. */
export class LogId {
  constructor(
    /** The block number the log was emitted in. */
    public readonly blockNumber: BlockNumber,
    /** The hash of the block the log was emitted in. */
    public readonly blockHash: BlockHash,
    /** The hash of the transaction the log was emitted in. */
    public readonly txHash: TxHash,
    /** The index of a tx in a block the log was emitted in. */
    public readonly txIndex: number,
    /** The index of a log the tx was emitted in. */
    public readonly logIndex: number,
  ) {
    if (!Number.isInteger(blockNumber) || blockNumber < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid block number: ${blockNumber}`);
    }
    if (!Number.isInteger(txIndex)) {
      throw new Error(`Invalid tx index: ${txIndex}`);
    }
    if (!Number.isInteger(logIndex)) {
      throw new Error(`Invalid log index: ${logIndex}`);
    }
  }

  static random() {
    return new LogId(
      BlockNumber(Math.floor(Math.random() * 1000) + 1),
      BlockHash.random(),
      TxHash.random(),
      Math.floor(Math.random() * 1000),
      Math.floor(Math.random() * 100),
    );
  }

  static get schema() {
    return z
      .object({
        blockNumber: BlockNumberSchema,
        blockHash: BlockHash.schema,
        txHash: TxHash.schema,
        txIndex: schemas.Integer,
        logIndex: schemas.Integer,
      })
      .transform(
        ({ blockNumber, blockHash, txHash, txIndex, logIndex }) =>
          new LogId(blockNumber, blockHash, txHash, txIndex, logIndex),
      );
  }

  /**
   * Serializes log id to a buffer.
   * @returns A buffer containing the serialized log id.
   */
  public toBuffer(): Buffer {
    return Buffer.concat([
      toBufferBE(BigInt(this.blockNumber), 4),
      this.blockHash.toBuffer(),
      this.txHash.toBuffer(),
      toBufferBE(BigInt(this.txIndex), 4),
      toBufferBE(BigInt(this.logIndex), 4),
    ]);
  }

  /**
   * Creates a LogId from a buffer.
   * @param buffer - A buffer containing the serialized log id.
   * @returns A log id.
   */
  static fromBuffer(buffer: Buffer | BufferReader): LogId {
    const reader = BufferReader.asReader(buffer);

    const blockNumber = BlockNumber(reader.readNumber());
    const blockHash = new BlockHash(reader.readObject(Fr));
    const txHash = reader.readObject(TxHash);
    const txIndex = reader.readNumber();
    const logIndex = reader.readNumber();

    return new LogId(blockNumber, blockHash, txHash, txIndex, logIndex);
  }

  /**
   * Converts the LogId instance to a string.
   * @returns A string representation of the log id.
   */
  public toString(): string {
    return `${this.blockNumber}-${this.txIndex}-${this.logIndex}-${this.blockHash.toString()}-${this.txHash.toString()}`;
  }

  /**
   * Creates a LogId from a string.
   * @param data - A string representation of a log id.
   * @returns A log id.
   */
  static fromString(data: string): LogId {
    const [rawBlockNumber, rawTxIndex, rawLogIndex, rawBlockHash, rawTxHash] = data.split('-');
    const blockNumber = BlockNumber(Number(rawBlockNumber));
    const blockHash = BlockHash.fromString(rawBlockHash);
    const txHash = TxHash.fromString(rawTxHash);
    const txIndex = Number(rawTxIndex);
    const logIndex = Number(rawLogIndex);

    return new LogId(blockNumber, blockHash, txHash, txIndex, logIndex);
  }

  /**
   * Serializes log id to a human readable string.
   * @returns A human readable representation of the log id.
   */
  public toHumanReadable(): string {
    return `logId: (blockNumber: ${this.blockNumber}, blockHash: ${this.blockHash.toString()}, txHash: ${this.txHash.toString()}, txIndex: ${this.txIndex}, logIndex: ${this.logIndex})`;
  }
}
