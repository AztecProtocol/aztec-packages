import { type ZodTypeAny, z } from 'zod';

import { schemas } from '../schemas/index.js';
import { L2BlockHash } from './block_hash.js';
import type { L2Block } from './l2_block.js';

// Note: If you expand this type with indexInBlock, then delete `IndexedTxEffect` and use this type instead.
export type InBlock<T> = {
  l2BlockNumber: number;
  l2BlockHash: L2BlockHash;
  data: T;
};

export function randomInBlock<T>(data: T): InBlock<T> {
  return {
    data,
    l2BlockNumber: Math.floor(Math.random() * 1000),
    l2BlockHash: L2BlockHash.random(),
  };
}

export async function wrapInBlock<T>(data: T, block: L2Block): Promise<InBlock<T>> {
  return {
    data,
    l2BlockNumber: block.number,
    l2BlockHash: L2BlockHash.fromField(await block.hash()),
  };
}

export function inBlockSchemaFor<T extends ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    l2BlockNumber: schemas.Integer,
    l2BlockHash: L2BlockHash.schema,
  });
}
