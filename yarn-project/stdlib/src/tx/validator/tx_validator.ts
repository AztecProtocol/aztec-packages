import { z } from 'zod';

import type { ZodFor } from '../../schemas/schemas.js';
import type { ProcessedTx } from '../processed_tx.js';
import type { Tx } from '../tx.js';
import type { TxHash } from '../tx_hash.js';

export type AnyTx = Tx | ProcessedTx;

export function getTxHash(tx: AnyTx): TxHash {
  return 'txHash' in tx ? tx.txHash : tx.hash;
}

export function hasPublicCalls(tx: AnyTx): boolean {
  return tx.data.numberOfPublicCallRequests() > 0;
}

export type TxValidationResult =
  | { result: 'valid' }
  | { result: 'invalid'; reason: string[] }
  | { result: 'skipped'; reason: string[] };

export interface TxValidator<T extends AnyTx = AnyTx> {
  validateTx(tx: T): Promise<TxValidationResult>;
}

export const TxValidationResultSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('valid'), reason: z.array(z.string()).optional() }),
  z.object({ result: z.literal('invalid'), reason: z.array(z.string()) }),
  z.object({ result: z.literal('skipped'), reason: z.array(z.string()) }),
]) satisfies ZodFor<TxValidationResult>;
