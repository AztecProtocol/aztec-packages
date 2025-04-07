import { schemas } from '@aztec/foundation/schemas';

import { type InBlock, inBlockSchemaFor } from '../block/in_block.js';
import { TxEffect } from './tx_effect.js';

export type IndexedTxEffect = InBlock<TxEffect> & { txIndexInBlock: number };

export function indexedTxSchema() {
  return inBlockSchemaFor(TxEffect.schema).extend({ txIndexInBlock: schemas.Integer });
}
