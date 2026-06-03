import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import type { LogResultBase } from './log_result.js';

/**
 * Cursor identifying a position in a tag's ordered log stream. Used as `afterLog` on `TagQuery` to resume
 * pagination strictly after a previously-seen log.
 *
 * `(blockNumber, txIndexWithinBlock, logIndexWithinTx)` is sufficient to uniquely identify a position
 * and matches the composite-key ordering of the archiver's log index, so the cursor maps directly to a
 * key without a tx-hash lookup. All three fields are always present on {@link LogResult}, so a cursor is
 * constructible from any returned log.
 */
export class LogCursor {
  constructor(
    /** The block the cursor points to. */
    public readonly blockNumber: BlockNumber,
    /** The tx index within the block the cursor points to. */
    public readonly txIndexWithinBlock: number,
    /** The log index within the tx the cursor points to. */
    public readonly logIndexWithinTx: number,
  ) {}

  static get schema() {
    return z
      .object({
        blockNumber: BlockNumberSchema,
        txIndexWithinBlock: schemas.Integer,
        logIndexWithinTx: schemas.Integer,
      })
      .transform(
        ({ blockNumber, txIndexWithinBlock, logIndexWithinTx }) =>
          new LogCursor(blockNumber, txIndexWithinBlock, logIndexWithinTx),
      );
  }

  /** Builds a cursor that points at the given log. Pagination resumes strictly after this position. */
  static fromLog(log: Pick<LogResultBase, 'blockNumber' | 'txIndexWithinBlock' | 'logIndexWithinTx'>): LogCursor {
    return new LogCursor(log.blockNumber, log.txIndexWithinBlock, log.logIndexWithinTx);
  }

  static random(): LogCursor {
    return new LogCursor(
      BlockNumber(Math.floor(Math.random() * 100000) + 1),
      Math.floor(Math.random() * 100),
      Math.floor(Math.random() * 100),
    );
  }

  toBuffer(): Buffer {
    return Buffer.concat([
      numToUInt32BE(this.blockNumber),
      numToUInt32BE(this.txIndexWithinBlock),
      numToUInt32BE(this.logIndexWithinTx),
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): LogCursor {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = BlockNumber(reader.readNumber());
    const txIndexWithinBlock = reader.readNumber();
    const logIndexWithinTx = reader.readNumber();
    return new LogCursor(blockNumber, txIndexWithinBlock, logIndexWithinTx);
  }

  equals(other: LogCursor): boolean {
    return (
      this.blockNumber === other.blockNumber &&
      this.txIndexWithinBlock === other.txIndexWithinBlock &&
      this.logIndexWithinTx === other.logIndexWithinTx
    );
  }

  toString(): string {
    return `${this.blockNumber}-${this.txIndexWithinBlock}-${this.logIndexWithinTx}`;
  }

  /**
   * Parses a `<blockNumber>-<txIndexWithinBlock>-<logIndexWithinTx>` triple into a {@link LogCursor}.
   * Throws on malformed input. Returns `undefined` for an empty / missing value so callers can use
   * this directly as an optional CLI option parser.
   */
  static parseOptional(value: string): LogCursor | undefined {
    if (!value) {
      return undefined;
    }
    const parts = value.split('-');
    if (parts.length !== 3) {
      throw new Error(`Invalid log cursor "${value}". Expected <blockNumber>-<txIndexWithinBlock>-<logIndexWithinTx>.`);
    }
    const [blockNumberStr, txIndexStr, logIndexStr] = parts;
    const blockNumber = Number(blockNumberStr);
    const txIndexWithinBlock = Number(txIndexStr);
    const logIndexWithinTx = Number(logIndexStr);
    if (!Number.isInteger(blockNumber) || blockNumber < 1) {
      throw new Error(`Invalid log cursor block number: ${blockNumberStr}`);
    }
    if (!Number.isInteger(txIndexWithinBlock) || txIndexWithinBlock < 0) {
      throw new Error(`Invalid log cursor tx index: ${txIndexStr}`);
    }
    if (!Number.isInteger(logIndexWithinTx) || logIndexWithinTx < 0) {
      throw new Error(`Invalid log cursor log index: ${logIndexStr}`);
    }
    return new LogCursor(BlockNumber(blockNumber), txIndexWithinBlock, logIndexWithinTx);
  }
}
