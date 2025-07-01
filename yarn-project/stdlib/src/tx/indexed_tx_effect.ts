import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { L2BlockHash } from '../block/block_hash.js';
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

export function serializeIndexedTxEffect(effect: IndexedTxEffect): Buffer {
  return serializeToBuffer(effect.l2BlockHash, effect.l2BlockNumber, effect.txIndexInBlock, effect.data);
}

export function deserializeIndexedTxEffect(buffer: Buffer): IndexedTxEffect {
  const reader = BufferReader.asReader(buffer);

  const l2BlockHash = reader.readObject(L2BlockHash);
  const l2BlockNumber = reader.readNumber();
  const txIndexInBlock = reader.readNumber();
  const data = reader.readObject(TxEffect);

  return {
    l2BlockHash,
    l2BlockNumber,
    txIndexInBlock,
    data,
  };
}
