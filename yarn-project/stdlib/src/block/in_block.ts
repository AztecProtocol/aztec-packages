import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';

import { type ZodTypeAny, z } from 'zod';

import { BlockHash } from './block_hash.js';
import type { L2Block } from './l2_block.js';

export type InBlock = {
  l2BlockNumber: BlockNumber;
  l2BlockHash: BlockHash;
};

// Note: If you expand this type with indexInBlock, then delete `IndexedTxEffect` and use this type instead.
export type DataInBlock<T> = {
  data: T;
} & InBlock;

export function randomInBlock(): InBlock {
  return {
    l2BlockNumber: BlockNumber(Math.floor(Math.random() * 1000) + 1),
    l2BlockHash: BlockHash.random(),
  };
}

export function randomDataInBlock<T>(data: T): DataInBlock<T> {
  return {
    ...randomInBlock(),
    data,
  };
}

export async function wrapDataInBlock<T>(data: T, block: L2Block): Promise<DataInBlock<T>> {
  return {
    data,
    l2BlockNumber: block.number,
    l2BlockHash: await block.hash(),
  };
}

export function inBlockSchema() {
  return z.object({
    l2BlockNumber: BlockNumberSchema,
    l2BlockHash: BlockHash.schema,
  });
}

export function dataInBlockSchemaFor<T extends ZodTypeAny>(schema: T) {
  return inBlockSchema().extend({ data: schema });
}
