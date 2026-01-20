import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';

import { type ZodTypeAny, z } from 'zod';

import { L2BlockHash } from './block_hash.js';
import type { L2BlockNew } from './l2_block_new.js';

export type InBlock = {
  l2BlockNumber: BlockNumber;
  l2BlockHash: L2BlockHash;
};

// Note: If you expand this type with indexInBlock, then delete `IndexedTxEffect` and use this type instead.
export type DataInBlock<T> = {
  data: T;
} & InBlock;

export function randomInBlock(): InBlock {
  return {
    l2BlockNumber: BlockNumber(Math.floor(Math.random() * 1000)),
    l2BlockHash: L2BlockHash.random(),
  };
}

export function randomDataInBlock<T>(data: T): DataInBlock<T> {
  return {
    ...randomInBlock(),
    data,
  };
}

export async function wrapDataInBlock<T>(data: T, block: L2BlockNew): Promise<DataInBlock<T>> {
  return {
    data,
    l2BlockNumber: block.number,
    l2BlockHash: L2BlockHash.fromField(await block.hash()),
  };
}

export function inBlockSchema() {
  return z.object({
    l2BlockNumber: BlockNumberSchema,
    l2BlockHash: L2BlockHash.schema,
  });
}

export function dataInBlockSchemaFor<T extends ZodTypeAny>(schema: T) {
  return inBlockSchema().extend({ data: schema });
}
