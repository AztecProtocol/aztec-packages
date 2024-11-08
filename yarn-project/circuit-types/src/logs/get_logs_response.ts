import { Fr, fromBuffer } from '@aztec/circuits.js';
import { BufferReader, boolToBuffer, numToUInt32BE } from '@aztec/foundation/serialize';

import { TxHash } from '../index.js';
import { type ExtendedUnencryptedL2Log } from './extended_unencrypted_l2_log.js';

/**
 * It provides documentation for the GetUnencryptedLogsResponse type.
 */
export type GetUnencryptedLogsResponse = {
  /**
   * An array of ExtendedUnencryptedL2Log elements.
   */
  logs: ExtendedUnencryptedL2Log[];

  /**
   * Indicates if a limit has been reached.
   */
  maxLogsHit: boolean;
};

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
      TxHash.fromField(reader.readObject(Fr)),
      reader.readNumber(),
      reader.readNumber(),
      reader.readBoolean(),
      reader.readToEnd(),
    );
  }
}
