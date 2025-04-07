import { schemas } from '@aztec/foundation/schemas';

import { type InBlock, inBlockSchemaFor, randomInBlock } from '../block/in_block.js';
import { TxEffect } from './tx_effect.js';

export type IndexedTxEffect = InBlock<TxEffect> & { txIndexInBlock: number };

export function indexedTxSchema() {
  return inBlockSchemaFor(TxEffect.schema).extend({ txIndexInBlock: schemas.Integer });
}

export async function randomIndexedTxEffect(): Promise<IndexedTxEffect> {
  return {
    ...randomInBlock(await TxEffect.random()),
    txIndexInBlock: Math.floor(Math.random() * 1000),
  };
}
