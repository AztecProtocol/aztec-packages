import { BufferReader, boolToBuffer, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { TxHash } from '../tx/tx_hash.js';
import { PrivateLog } from './private_log.js';
import { PublicLog } from './public_log.js';

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
    public blockNumber: number,
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
        blockNumber: z.number(),
        log: z.union([PrivateLog.schema, PublicLog.schema]),
      })
      .transform(
        ({ txHash, dataStartIndexForTx, logIndexInTx, blockNumber, log }) =>
          new TxScopedL2Log(txHash, dataStartIndexForTx, logIndexInTx, blockNumber, log),
      );
  }

  toBuffer() {
    const isFromPublic = this.log instanceof PublicLog;
    return Buffer.concat([
      this.txHash.toBuffer(),
      numToUInt32BE(this.dataStartIndexForTx),
      numToUInt32BE(this.logIndexInTx),
      numToUInt32BE(this.blockNumber),
      boolToBuffer(isFromPublic),
      this.log.toBuffer(),
    ]);
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    const txHash = reader.readObject(TxHash);
    const dataStartIndexForTx = reader.readNumber();
    const logIndexInTx = reader.readNumber();
    const blockNumber = reader.readNumber();
    const isFromPublic = reader.readBoolean();
    const log = isFromPublic ? PublicLog.fromBuffer(reader) : PrivateLog.fromBuffer(reader);

    return new TxScopedL2Log(txHash, dataStartIndexForTx, logIndexInTx, blockNumber, log);
  }

  static async random(isFromPublic = Math.random() < 0.5) {
    const log = isFromPublic ? await PublicLog.random() : PrivateLog.random();
    return new TxScopedL2Log(TxHash.random(), 1, 1, 1, log);
  }

  equals(other: TxScopedL2Log) {
    return (
      this.txHash.equals(other.txHash) &&
      this.dataStartIndexForTx === other.dataStartIndexForTx &&
      this.logIndexInTx === other.logIndexInTx &&
      this.blockNumber === other.blockNumber &&
      ((this.log instanceof PublicLog && other.log instanceof PublicLog) ||
        (this.log instanceof PrivateLog && other.log instanceof PrivateLog)) &&
      this.log.equals(other.log as any)
    );
  }
}
