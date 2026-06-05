import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas as foundationSchemas } from '@aztec/foundation/schemas';
import type { PickIfFlag, Prettify } from '@aztec/foundation/types';

import { z } from 'zod';

import { BlockHash } from '../block/block_hash.js';
import { schemas } from '../schemas/schemas.js';
import { TxHash } from '../tx/tx_hash.js';
import type { UInt64 } from '../types/shared.js';

/** Options for narrowing the shape of a {@link LogResult}. */
export type LogIncludeOptions = {
  /** When set, the log carries `noteHashes` + all `nullifiers` from its tx effect. Off by default. */
  includeEffects?: boolean;
};

export const LogIncludeOptionsSchema: z.ZodType<LogIncludeOptions> = z.object({
  includeEffects: z.boolean().optional(),
});

/** Required metadata always present on a {@link LogResult}. */
export type LogResultBase = {
  /** The data contents of the log, with the tag as the first field. */
  logData: Fr[];
  /** The block this log was emitted in. */
  blockNumber: BlockNumber;
  /** The hash of the block this log was emitted in. */
  blockHash: BlockHash;
  /** The timestamp of the block this log was emitted in. */
  blockTimestamp: UInt64;
  /** The hash of the tx this log was emitted in. */
  txHash: TxHash;
  /** The 0-based index of this log's tx within its block. */
  txIndexWithinBlock: number;
  /** The 0-based index of this log within its tx (across both private and public logs for the tx). */
  logIndexWithinTx: number;
};

/**
 * A single log returned from {@link L2LogsSource.getPrivateLogsByTags} or {@link L2LogsSource.getPublicLogsByTags}.
 *
 * Generic over the include-options so that flagged fields become required when the caller passes a
 * literal `true`. The default type argument ({@link LogIncludeOptions}) yields the widest shape
 * (all include-fields optional) — this is what the JSON-RPC wire layer validates against.
 *
 * `logData` is the raw field-element payload, with the tag in field 0 (consumers slice it off).
 *
 * @example
 * const l: LogResult<{ includeEffects: true }> = (await node.getPrivateLogsByTags({ tags, includeEffects: true }))[0][0];
 * l.nullifiers; // required, not optional
 */
export type LogResult<Opts extends LogIncludeOptions = LogIncludeOptions> = Prettify<
  LogResultBase & PickIfFlag<LogIncludeOptions, Opts, 'includeEffects', { noteHashes: Fr[]; nullifiers: Fr[] }>
>;

/** Zod schema for the widest {@link LogResult} shape (all include-gated fields optional). */
export const LogResultSchema: z.ZodType<LogResult> = z.object({
  logData: z.array(foundationSchemas.Fr),
  blockNumber: BlockNumberSchema,
  blockHash: BlockHash.schema,
  blockTimestamp: schemas.UInt64,
  txHash: TxHash.schema,
  txIndexWithinBlock: schemas.Integer,
  logIndexWithinTx: schemas.Integer,
  noteHashes: z.array(foundationSchemas.Fr).optional(),
  nullifiers: z.array(foundationSchemas.Fr).optional(),
});

/** Builds a random {@link LogResult} for tests. `includeEffects` populates `noteHashes` + `nullifiers`. */
export function randomLogResult(includeEffects = false): LogResult {
  const base: LogResultBase = {
    logData: times(3, Fr.random),
    blockNumber: BlockNumber(Math.floor(Math.random() * 100000) + 1),
    blockHash: BlockHash.random(),
    blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
    txHash: TxHash.random(),
    txIndexWithinBlock: Math.floor(Math.random() * 100),
    logIndexWithinTx: Math.floor(Math.random() * 100),
  };
  if (includeEffects) {
    return { ...base, noteHashes: times(3, Fr.random), nullifiers: times(3, Fr.random) };
  }
  return base;
}

/** Human-readable single-line representation, primarily for the CLI `get-logs` command. */
export function logResultToHumanReadable(log: LogResult): string {
  const head =
    `block ${log.blockNumber} (${log.blockHash.toString()}) ` +
    `tx ${log.txHash.toString()} txIndex ${log.txIndexWithinBlock} logIndex ${log.logIndexWithinTx} ` +
    `ts ${log.blockTimestamp}`;
  const data = `data [${log.logData.map(f => f.toString()).join(', ')}]`;
  const parts = [head, data];
  if (log.noteHashes !== undefined) {
    parts.push(`noteHashes [${log.noteHashes.map(f => f.toString()).join(', ')}]`);
  }
  if (log.nullifiers !== undefined) {
    parts.push(`nullifiers [${log.nullifiers.map(f => f.toString()).join(', ')}]`);
  }
  return parts.join(' | ');
}
