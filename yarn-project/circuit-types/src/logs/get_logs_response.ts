import { Fr } from '@aztec/circuits.js';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';

import { EncryptedL2NoteLog, TxHash } from '../index.js';
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

export class TxScopedEncryptedL2NoteLog {
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
     * The encrypted note log
     */
    public log: EncryptedL2NoteLog,
  ) {}

  toBuffer() {
    return Buffer.concat([this.txHash.toBuffer(), numToUInt32BE(this.dataStartIndexForTx), this.log.toBuffer()]);
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    return new TxScopedEncryptedL2NoteLog(
      TxHash.fromField(reader.readObject(Fr)),
      reader.readNumber(),
      EncryptedL2NoteLog.fromBuffer(reader.readToEnd()),
    );
  }
}
