import { z } from 'zod';

import { type InBlock, inBlockSchema, randomInBlock } from '../block/in_block.js';
import { TxHash } from './tx_hash.js';

export type InTx = InBlock & {
  txHash: TxHash;
};

export function randomInTx(): InTx {
  return {
    ...randomInBlock(),
    txHash: TxHash.random(),
  };
}

export function inTxSchema() {
  return z.intersection(
    inBlockSchema(),
    z.object({
      txHash: TxHash.schema,
    }),
  );
}
