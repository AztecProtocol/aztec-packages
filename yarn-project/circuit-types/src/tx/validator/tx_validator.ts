import { type ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type ProcessedTx } from '../processed_tx.js';
import { type Tx } from '../tx.js';

export type AnyTx = Tx | ProcessedTx;

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
