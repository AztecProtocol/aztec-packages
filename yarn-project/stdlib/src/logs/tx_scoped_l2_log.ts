import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { BufferReader, bigintToUInt64BE, boolToBuffer, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { L2BlockHash } from '../block/block_hash.js';
import { schemas } from '../schemas/schemas.js';
import { TxHash } from '../tx/tx_hash.js';
import type { UInt64 } from '../types/shared.js';
import { PrivateLog } from './private_log.js';
import { PublicLog } from './public_log.js';

// TODO(F-231): Drop this and return the PrivateLogWithTxData and PublicLogWithTxData from Aztec node instead.
export class TxScopedL2Log {
  constructor(
    /*
     * Hash of the tx where the log is included
     */
    public txHash: TxHash,
    /*
     * The next available leaf index for the note hash tree for this transaction. It is stored
     * with the log so the noteHashIndex can be reconstructed after decryption.
     */
    public dataStartIndexForTx: number,
    /*
     * The index of the log in the transaction. Note that public and private logs are in separate arrays in the tx
     * effect and for this reason these indices are independent (a private and public log can have the same index).
     */
    public logIndexInTx: number,
    /*
     * The block this log is included in
     */
    public blockNumber: BlockNumber,
    /*
     * The block this log is included in
     */
    public blockHash: L2BlockHash,
    /*
     * The timestamp of the block this log is included in
     */
    public blockTimestamp: UInt64,
    /*
     * The log data as either a PrivateLog or PublicLog
     */
    public log: PrivateLog | PublicLog,
  ) {}

  get isFromPublic() {
    return this.log instanceof PublicLog;
  }

  static get schema() {
    return z
      .object({
        txHash: TxHash.schema,
        dataStartIndexForTx: z.number(),
        logIndexInTx: z.number(),
        blockNumber: BlockNumberSchema,
        blockHash: L2BlockHash.schema,
        blockTimestamp: schemas.UInt64,
        log: z.union([PrivateLog.schema, PublicLog.schema]),
      })
      .transform(
        ({ txHash, dataStartIndexForTx, logIndexInTx, blockNumber, blockHash, blockTimestamp, log }) =>
          new TxScopedL2Log(txHash, dataStartIndexForTx, logIndexInTx, blockNumber, blockHash, blockTimestamp, log),
      );
  }

  toBuffer() {
    return Buffer.concat([
      this.txHash.toBuffer(),
      numToUInt32BE(this.dataStartIndexForTx),
      numToUInt32BE(this.logIndexInTx),
      numToUInt32BE(this.blockNumber),
      this.blockHash.toBuffer(),
      bigintToUInt64BE(this.blockTimestamp),
      boolToBuffer(this.isFromPublic),
      this.log.toBuffer(),
    ]);
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    const txHash = reader.readObject(TxHash);
    const dataStartIndexForTx = reader.readNumber();
    const logIndexInTx = reader.readNumber();
    const blockNumber = BlockNumber(reader.readNumber());
    const blockHash = reader.readObject(L2BlockHash);
    const blockTimestamp = reader.readUInt64();
    const isFromPublic = reader.readBoolean();
    const log = isFromPublic ? PublicLog.fromBuffer(reader) : PrivateLog.fromBuffer(reader);

    return new TxScopedL2Log(txHash, dataStartIndexForTx, logIndexInTx, blockNumber, blockHash, blockTimestamp, log);
  }

  static async random(isFromPublic = Math.random() < 0.5) {
    const log = isFromPublic ? await PublicLog.random() : PrivateLog.random();
    return new TxScopedL2Log(TxHash.random(), 1, 1, BlockNumber(1), L2BlockHash.random(), 1n, log);
  }

  equals(other: TxScopedL2Log) {
    return (
      this.txHash.equals(other.txHash) &&
      this.dataStartIndexForTx === other.dataStartIndexForTx &&
      this.logIndexInTx === other.logIndexInTx &&
      this.blockNumber === other.blockNumber &&
      this.blockHash.equals(other.blockHash) &&
      this.blockTimestamp === other.blockTimestamp &&
      ((this.log instanceof PublicLog && other.log instanceof PublicLog) ||
        (this.log instanceof PrivateLog && other.log instanceof PrivateLog)) &&
      this.log.equals(other.log as any)
    );
  }
}
