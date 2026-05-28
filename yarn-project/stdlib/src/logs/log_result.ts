import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas as foundationSchemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  bigintToUInt64BE,
  numToUInt32BE,
  serializeArrayOfBufferableToVector,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { BlockHash } from '../block/block_hash.js';
import { schemas } from '../schemas/schemas.js';
import { TxHash } from '../tx/tx_hash.js';
import type { UInt64 } from '../types/shared.js';

/**
 * A single log returned from {@link L2LogsSource.getPrivateLogsByTags} or {@link L2LogsSource.getPublicLogsByTags}.
 *
 * `logData` is the raw field-element payload, with the tag in field 0 (consumers slice it off).
 * `blockNumber`, `blockHash`, `blockTimestamp`, `txHash`, and `logIndexWithinTx` are always present.
 * `noteHashes` and `nullifiers` are populated only when the query opts in via `includeEffects` — they are
 * fetched on demand from the block store and carry **all** nullifiers in the tx, not just the first.
 */
export class LogResult {
  constructor(
    /** The data contents of the log, with the tag as the first field. */
    public readonly logData: Fr[],
    /** The block this log was emitted in. */
    public readonly blockNumber: BlockNumber,
    /** The hash of the block this log was emitted in. */
    public readonly blockHash: BlockHash,
    /** The timestamp of the block this log was emitted in. */
    public readonly blockTimestamp: UInt64,
    /** The hash of the tx this log was emitted in. */
    public readonly txHash: TxHash,
    /** The 0-based index of this log within its tx (across both private and public logs for the tx). */
    public readonly logIndexWithinTx: number,
    /** All note hashes from the tx effect — populated only when `includeEffects` is set. */
    public readonly noteHashes?: Fr[],
    /** All nullifiers from the tx effect (not just the first) — populated only when `includeEffects` is set. */
    public readonly nullifiers?: Fr[],
  ) {}

  static get schema() {
    return z
      .object({
        logData: z.array(foundationSchemas.Fr),
        blockNumber: BlockNumberSchema,
        blockHash: BlockHash.schema,
        blockTimestamp: schemas.UInt64,
        txHash: TxHash.schema,
        logIndexWithinTx: schemas.Integer,
        noteHashes: z.array(foundationSchemas.Fr).optional(),
        nullifiers: z.array(foundationSchemas.Fr).optional(),
      })
      .transform(LogResult.from);
  }

  static from(fields: FieldsOf<LogResult>) {
    return new LogResult(
      fields.logData,
      fields.blockNumber,
      fields.blockHash,
      fields.blockTimestamp,
      fields.txHash,
      fields.logIndexWithinTx,
      fields.noteHashes,
      fields.nullifiers,
    );
  }

  /**
   * Serializes the log to a buffer. The optional effect fields are prefixed with a presence byte so the
   * round-trip distinguishes "absent" from "empty array".
   */
  toBuffer(): Buffer {
    const parts: Buffer[] = [
      serializeArrayOfBufferableToVector(this.logData),
      numToUInt32BE(this.blockNumber),
      this.blockHash.toBuffer(),
      bigintToUInt64BE(this.blockTimestamp),
      this.txHash.toBuffer(),
      numToUInt32BE(this.logIndexWithinTx),
      Buffer.from([this.noteHashes !== undefined ? 1 : 0]),
    ];
    if (this.noteHashes !== undefined) {
      parts.push(serializeArrayOfBufferableToVector(this.noteHashes));
    }
    parts.push(Buffer.from([this.nullifiers !== undefined ? 1 : 0]));
    if (this.nullifiers !== undefined) {
      parts.push(serializeArrayOfBufferableToVector(this.nullifiers));
    }
    return Buffer.concat(parts);
  }

  static fromBuffer(buffer: Buffer | BufferReader): LogResult {
    const reader = BufferReader.asReader(buffer);
    const logData = reader.readVector(Fr);
    const blockNumber = BlockNumber(reader.readNumber());
    const blockHash = reader.readObject(BlockHash);
    const blockTimestamp = reader.readUInt64();
    const txHash = reader.readObject(TxHash);
    const logIndexWithinTx = reader.readNumber();
    const noteHashes = reader.readBoolean() ? reader.readVector(Fr) : undefined;
    const nullifiers = reader.readBoolean() ? reader.readVector(Fr) : undefined;
    return new LogResult(
      logData,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      logIndexWithinTx,
      noteHashes,
      nullifiers,
    );
  }

  static random(includeEffects = false): LogResult {
    return new LogResult(
      times(3, Fr.random),
      BlockNumber(Math.floor(Math.random() * 100000) + 1),
      BlockHash.random(),
      BigInt(Math.floor(Date.now() / 1000)),
      TxHash.random(),
      Math.floor(Math.random() * 100),
      includeEffects ? times(3, Fr.random) : undefined,
      includeEffects ? times(3, Fr.random) : undefined,
    );
  }

  equals(other: LogResult): boolean {
    return (
      this.blockNumber === other.blockNumber &&
      this.blockHash.equals(other.blockHash) &&
      this.blockTimestamp === other.blockTimestamp &&
      this.txHash.equals(other.txHash) &&
      this.logIndexWithinTx === other.logIndexWithinTx &&
      this.logData.length === other.logData.length &&
      this.logData.every((f, i) => f.equals(other.logData[i])) &&
      LogResult.#optionalFieldsEqual(this.noteHashes, other.noteHashes) &&
      LogResult.#optionalFieldsEqual(this.nullifiers, other.nullifiers)
    );
  }

  /** Human-readable single-line representation, primarily for the CLI `get-logs` command. */
  toHumanReadable(): string {
    const head =
      `block ${this.blockNumber} (${this.blockHash.toString()}) ` +
      `tx ${this.txHash.toString()} logIndex ${this.logIndexWithinTx} ` +
      `ts ${this.blockTimestamp}`;
    const data = `data [${this.logData.map(f => f.toString()).join(', ')}]`;
    const parts = [head, data];
    if (this.noteHashes !== undefined) {
      parts.push(`noteHashes [${this.noteHashes.map(f => f.toString()).join(', ')}]`);
    }
    if (this.nullifiers !== undefined) {
      parts.push(`nullifiers [${this.nullifiers.map(f => f.toString()).join(', ')}]`);
    }
    return parts.join(' | ');
  }

  static #optionalFieldsEqual(a: Fr[] | undefined, b: Fr[] | undefined): boolean {
    if (a === undefined && b === undefined) {
      return true;
    }
    if (a === undefined || b === undefined) {
      return false;
    }
    return a.length === b.length && a.every((f, i) => f.equals(b[i]));
  }
}
