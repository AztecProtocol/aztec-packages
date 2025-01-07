import { Fr } from '@aztec/circuits.js';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, boolToBuffer, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { TxHash } from '../tx/tx_hash.js';
import { ExtendedUnencryptedL2Log } from './extended_unencrypted_l2_log.js';

/** Response for the getUnencryptedLogs archiver call. */
export type GetUnencryptedLogsResponse = {
  /** An array of ExtendedUnencryptedL2Log elements. */
  logs: ExtendedUnencryptedL2Log[];
  /** Indicates if a limit has been reached. */
  maxLogsHit: boolean;
};

export const GetUnencryptedLogsResponseSchema = z.object({
  logs: z.array(ExtendedUnencryptedL2Log.schema),
  maxLogsHit: z.boolean(),
}) satisfies ZodFor<GetUnencryptedLogsResponse>;

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
     * The block this log is included in
     */
    public blockNumber: number,
    /*
     * Indicates if the log comes from the unencrypted logs stream (partial note)
     */
    public isFromPublic: boolean,
    /*
     * The log data
     */
    public logData: Buffer,
  ) {}

  static get schema() {
    return z
      .object({
        txHash: TxHash.schema,
        dataStartIndexForTx: z.number(),
        blockNumber: z.number(),
        isFromPublic: z.boolean(),
        logData: schemas.Buffer,
      })
      .transform(
        ({ txHash, dataStartIndexForTx, blockNumber, isFromPublic, logData }) =>
          new TxScopedL2Log(txHash, dataStartIndexForTx, blockNumber, isFromPublic, logData),
      );
  }

  toBuffer() {
    return Buffer.concat([
      this.txHash.toBuffer(),
      numToUInt32BE(this.dataStartIndexForTx),
      numToUInt32BE(this.blockNumber),
      boolToBuffer(this.isFromPublic),
      this.logData,
    ]);
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    return new TxScopedL2Log(
      reader.readObject(TxHash),
      reader.readNumber(),
      reader.readNumber(),
      reader.readBoolean(),
      reader.readToEnd(),
    );
  }

  static random() {
    return new TxScopedL2Log(TxHash.random(), 1, 1, false, Fr.random().toBuffer());
  }

  equals(other: TxScopedL2Log) {
    return (
      this.txHash.equals(other.txHash) &&
      this.dataStartIndexForTx === other.dataStartIndexForTx &&
      this.blockNumber === other.blockNumber &&
      this.isFromPublic === other.isFromPublic &&
      this.logData.equals(other.logData)
    );
  }
}
