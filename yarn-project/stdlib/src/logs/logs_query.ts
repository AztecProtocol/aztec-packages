import { BlockNumberSchema } from '@aztec/foundation/branded-types';
import type { BlockNumber } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { BlockHash } from '../block/block_hash.js';
import { MAX_LOGS_PER_TAG, MAX_RPC_LEN } from '../interfaces/api_limit.js';
import { type ZodFor, schemas, zodFor } from '../schemas/index.js';
import { TxHash } from '../tx/tx_hash.js';
import { LogCursor } from './log_cursor.js';
import { SiloedTag } from './siloed_tag.js';
import { Tag } from './tag.js';

/**
 * A tag to query in {@link PrivateLogsQuery} / {@link PublicLogsQuery}, optionally resuming strictly
 * after a previously-seen log via `afterLog`. The bare `T` form means "from the beginning".
 */
export type TagQuery<T extends Tag | SiloedTag> = T | { tag: T; afterLog?: LogCursor };

/**
 * Shared fields for {@link PrivateLogsQuery} and {@link PublicLogsQuery}.
 */
export type LogsQueryBase = {
  /** Lower block bound, inclusive. */
  fromBlock?: BlockNumber;
  /** Upper block bound, exclusive. */
  toBlock?: BlockNumber;
  /**
   * Restrict results to logs emitted in this transaction. Mutually exclusive with `fromBlock`/`toBlock`
   * (a txHash already pins a block). `txHash` + `afterLog` is allowed and paginates within the tx's logs
   * for that tag.
   */
  txHash?: TxHash;
  /**
   * Reorg-safety anchor: the latest block hash the caller has synced to. If set and the block is no
   * longer present, the call throws. Distinct from `toBlock`, which is a filter, not a safety check.
   */
  referenceBlock?: BlockHash;
  /** When set, each log also carries `noteHashes` and all `nullifiers` for note-nonce discovery. */
  includeEffects?: boolean;
  /**
   * Maximum number of logs returned per tag. Capped at {@link MAX_LOGS_PER_TAG} (rejected if higher).
   * Defaults to {@link MAX_LOGS_PER_TAG} when unset. Mainly useful for tests that need to force
   * pagination at a small page size.
   */
  limitPerTag?: number;
};

/**
 * Query for {@link L2LogsSource.getPrivateLogsByTags}. Returns one inner array per element of `tags`,
 * in input order.
 */
export type PrivateLogsQuery = LogsQueryBase & {
  /** Tags to query. Between 1 and {@link MAX_RPC_LEN} entries (inclusive). */
  tags: TagQuery<SiloedTag>[];
};

/**
 * Query for {@link L2LogsSource.getPublicLogsByTags}. Returns one inner array per element of `tags`,
 * in input order.
 */
export type PublicLogsQuery = LogsQueryBase & {
  /** Contract address that emitted the logs. Required for public queries. */
  contractAddress: AztecAddress;
  /** Tags to query. Between 1 and {@link MAX_RPC_LEN} entries (inclusive). */
  tags: TagQuery<Tag>[];
};

function tagQuerySchema<T extends Tag | SiloedTag>(tagSchema: ZodFor<T>) {
  return z.union([
    tagSchema,
    z.object({
      tag: tagSchema,
      afterLog: LogCursor.schema.optional(),
    }),
  ]) as ZodFor<TagQuery<T>>;
}

const logsQueryBaseShape = {
  fromBlock: BlockNumberSchema.optional(),
  toBlock: BlockNumberSchema.optional(),
  txHash: TxHash.schema.optional(),
  referenceBlock: BlockHash.schema.optional(),
  includeEffects: z.boolean().optional(),
  limitPerTag: z
    .number()
    .int()
    .positive()
    .max(MAX_LOGS_PER_TAG, { message: `limitPerTag must be <= ${MAX_LOGS_PER_TAG}` })
    .optional(),
};

/** Minimal shape required by {@link refineTxHashAndRange}. */
type TxHashAndRangeFields = {
  /** Tx hash filter. */
  txHash?: TxHash;
  /** Lower block bound. */
  fromBlock?: BlockNumber;
  /** Upper block bound (exclusive). */
  toBlock?: BlockNumber;
};

/**
 * Refinement: a `txHash` already pins a block, so combining it with a block range is contradictory.
 * (`txHash` + `afterLog` is still allowed and is enforced per-tag inside `TagQuery`.) Exported so
 * `aztec.js`'s wallet event-filter schemas can reuse the same rule.
 */
export function refineTxHashAndRange<T extends TxHashAndRangeFields>(schema: z.ZodType<T>) {
  return schema.refine(q => !(q.txHash !== undefined && (q.fromBlock !== undefined || q.toBlock !== undefined)), {
    message: '`txHash` is mutually exclusive with `fromBlock`/`toBlock`',
  });
}

export const PrivateLogsQuerySchema: ZodFor<PrivateLogsQuery> = refineTxHashAndRange(
  zodFor<PrivateLogsQuery>()(
    z.object({
      ...logsQueryBaseShape,
      tags: z
        .array(tagQuerySchema(SiloedTag.schema))
        .min(1)
        .max(MAX_RPC_LEN, { message: `tags must have at most ${MAX_RPC_LEN} entries` }),
    }),
  ),
);

export const PublicLogsQuerySchema: ZodFor<PublicLogsQuery> = refineTxHashAndRange(
  zodFor<PublicLogsQuery>()(
    z.object({
      ...logsQueryBaseShape,
      contractAddress: schemas.AztecAddress,
      tags: z
        .array(tagQuerySchema(Tag.schema))
        .min(1)
        .max(MAX_RPC_LEN, { message: `tags must have at most ${MAX_RPC_LEN} entries` }),
    }),
  ),
);
