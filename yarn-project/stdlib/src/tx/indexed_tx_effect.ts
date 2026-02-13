import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { BlockHash } from '../block/block_hash.js';
import { type DataInBlock, dataInBlockSchemaFor, randomDataInBlock } from '../block/in_block.js';
import { TxEffect } from './tx_effect.js';

export type IndexedTxEffect = DataInBlock<TxEffect> & { txIndexInBlock: number };

export function indexedTxSchema() {
  return dataInBlockSchemaFor(TxEffect.schema).extend({ txIndexInBlock: schemas.Integer });
}

export async function randomIndexedTxEffect(): Promise<IndexedTxEffect> {
  return {
    ...randomDataInBlock(await TxEffect.random({ numNullifiers: 1 + Math.floor(Math.random() * 64) })),
    txIndexInBlock: Math.floor(Math.random() * 1000),
  };
}

export function serializeIndexedTxEffect(effect: IndexedTxEffect): Buffer {
  return serializeToBuffer(effect.l2BlockHash, effect.l2BlockNumber, effect.txIndexInBlock, effect.data);
}

export function deserializeIndexedTxEffect(buffer: Buffer): IndexedTxEffect {
  const reader = BufferReader.asReader(buffer);

  const l2BlockHash = new BlockHash(reader.readObject(Fr));
  const l2BlockNumber = BlockNumber(reader.readNumber());
  const txIndexInBlock = reader.readNumber();
  const data = reader.readObject(TxEffect);

  return {
    l2BlockHash,
    l2BlockNumber,
    txIndexInBlock,
    data,
  };
}
