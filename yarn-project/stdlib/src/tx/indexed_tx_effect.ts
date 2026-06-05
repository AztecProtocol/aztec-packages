import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { BlockHash } from '../block/block_hash.js';
import { type DataInBlock, dataInBlockSchemaFor, randomDataInBlock } from '../block/in_block.js';
import { TxEffect } from './tx_effect.js';

/** A tx effect together with its position in the block (`txIndexInBlock`) and the slot the block was built in. */
export type IndexedTxEffect = DataInBlock<TxEffect> & { txIndexInBlock: number; slotNumber: SlotNumber };

export function indexedTxSchema() {
  return dataInBlockSchemaFor(TxEffect.schema).extend({
    txIndexInBlock: schemas.Integer,
    slotNumber: schemas.SlotNumber,
  });
}

export async function randomIndexedTxEffect(): Promise<IndexedTxEffect> {
  return {
    ...randomDataInBlock(await TxEffect.random({ numNullifiers: 1 + Math.floor(Math.random() * 64) })),
    txIndexInBlock: Math.floor(Math.random() * 1000),
    slotNumber: SlotNumber(Math.floor(Math.random() * 1000)),
  };
}

export function serializeIndexedTxEffect(effect: IndexedTxEffect): Buffer {
  return serializeToBuffer(
    effect.l2BlockHash,
    effect.l2BlockNumber,
    effect.txIndexInBlock,
    effect.slotNumber,
    effect.data,
  );
}

export function deserializeIndexedTxEffect(buffer: Buffer): IndexedTxEffect {
  const reader = BufferReader.asReader(buffer);

  const l2BlockHash = BlockHash.fromBuffer(reader);
  const l2BlockNumber = BlockNumber(reader.readNumber());
  const txIndexInBlock = reader.readNumber();
  const slotNumber = SlotNumber(reader.readNumber());
  const data = reader.readObject(TxEffect);

  return {
    l2BlockHash,
    l2BlockNumber,
    txIndexInBlock,
    slotNumber,
    data,
  };
}
