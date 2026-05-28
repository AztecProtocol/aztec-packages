import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import { TxHash } from '../tx/tx_hash.js';
import type { LogResult } from './log_result.js';

/**
 * Cursor identifying a position in a tag's ordered log stream. Used as `afterLog` on `TagQuery` to resume
 * pagination strictly after a previously-seen log.
 *
 * `(blockNumber, txHash, logIndexWithinTx)` is sufficient to uniquely identify a position:
 * `txHash` disambiguates two txs in the same block; `logIndexWithinTx` disambiguates two logs in the same tx.
 * All three fields are always present on {@link LogResult}, so a cursor is constructible from any returned log.
 */
export class LogCursor {
  constructor(
    /** The block the cursor points to. */
    public readonly blockNumber: BlockNumber,
    /** The tx the cursor points to. */
    public readonly txHash: TxHash,
    /** The log index within the tx the cursor points to. */
    public readonly logIndexWithinTx: number,
  ) {}

  static get schema() {
    return z
      .object({
        blockNumber: BlockNumberSchema,
        txHash: TxHash.schema,
        logIndexWithinTx: schemas.Integer,
      })
      .transform(({ blockNumber, txHash, logIndexWithinTx }) => new LogCursor(blockNumber, txHash, logIndexWithinTx));
  }

  /** Builds a cursor that points at the given log. Pagination resumes strictly after this position. */
  static fromLog(log: LogResult): LogCursor {
    return new LogCursor(log.blockNumber, log.txHash, log.logIndexWithinTx);
  }

  static random(): LogCursor {
    return new LogCursor(
      BlockNumber(Math.floor(Math.random() * 100000) + 1),
      TxHash.fromField(Fr.random()),
      Math.floor(Math.random() * 100),
    );
  }

  toBuffer(): Buffer {
    return Buffer.concat([
      numToUInt32BE(this.blockNumber),
      this.txHash.toBuffer(),
      numToUInt32BE(this.logIndexWithinTx),
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): LogCursor {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = BlockNumber(reader.readNumber());
    const txHash = reader.readObject(TxHash);
    const logIndexWithinTx = reader.readNumber();
    return new LogCursor(blockNumber, txHash, logIndexWithinTx);
  }

  equals(other: LogCursor): boolean {
    return (
      this.blockNumber === other.blockNumber &&
      this.txHash.equals(other.txHash) &&
      this.logIndexWithinTx === other.logIndexWithinTx
    );
  }

  toString(): string {
    return `${this.blockNumber}-${this.txHash.toString()}-${this.logIndexWithinTx}`;
  }
}
