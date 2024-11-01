import { Fr } from '@aztec/circuits.js';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { TxHash } from '../tx/tx_hash.js';
import { EncryptedL2NoteLog } from './encrypted_l2_note_log.js';
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
}) satisfies z.ZodType<GetUnencryptedLogsResponse, any, any>;

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
