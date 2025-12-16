import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';

import { type ZodTypeAny, z } from 'zod';

import { L2BlockHash } from './block_hash.js';
import type { L2Block } from './l2_block.js';

export type InBlock = {
  l2BlockNumber: BlockNumber;
  l2BlockHash: L2BlockHash;
};

// Note: If you expand this type with indexInBlock, then delete `IndexedTxEffect` and use this type instead.
export type DataInBlock<T> = {
  data: T;
} & InBlock;

export function randomInBlock<T>(data: T): DataInBlock<T> {
  return {
    data,
    l2BlockNumber: BlockNumber(Math.floor(Math.random() * 1000)),
    l2BlockHash: L2BlockHash.random(),
  };
}

export async function wrapInBlock<T>(data: T, block: L2Block): Promise<DataInBlock<T>> {
  return {
    data,
    l2BlockNumber: block.number,
    l2BlockHash: L2BlockHash.fromField(await block.hash()),
  };
}

export function inBlockSchemaFor<T extends ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    l2BlockNumber: BlockNumberSchema,
    l2BlockHash: L2BlockHash.schema,
  });
}
