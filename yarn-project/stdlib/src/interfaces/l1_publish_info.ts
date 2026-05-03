import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { L1PublishedData } from '../checkpoint/published_checkpoint.js';

/**
 * L1 publication info for a block or checkpoint.
 *
 * A discriminated union over `published`: when `false`, the block/checkpoint has not yet been
 * published to L1. When `true`, the L1 block info (number, timestamp, hash) is present.
 *
 * Distinct from {@link L1PublishedData}, which is always the "published" case.
 */
export type L1PublishInfo =
  | { published: false }
  | { published: true; blockNumber: bigint; timestamp: bigint; blockHash: string };

export const L1PublishInfoSchema = z.union([
  z.object({ published: z.literal(false) }),
  z.object({
    published: z.literal(true),
    blockNumber: schemas.BigInt,
    timestamp: schemas.BigInt,
    blockHash: z.string(),
  }),
]);

/** Projects the internal {@link L1PublishedData} (or its absence) to the public {@link L1PublishInfo} shape. */
export function l1PublishInfoFromL1PublishedData(data: L1PublishedData | undefined): L1PublishInfo {
  if (!data) {
    return { published: false };
  }
  return {
    published: true,
    blockNumber: data.blockNumber,
    timestamp: data.timestamp,
    blockHash: data.blockHash,
  };
}
