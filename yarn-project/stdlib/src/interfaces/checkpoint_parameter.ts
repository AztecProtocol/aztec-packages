import { CheckpointNumberSchema, SlotNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { ChainTipSchema } from './chain_tips.js';

/**
 * Selector for a checkpoint in RPC calls.
 *
 * Accepts a numeric checkpoint number (or `{ number }`), a slot number (`{ slot }`), a chain-tip
 * name (e.g. `'proven'`), or `'latest'` (alias for `'proposed'` — on the checkpoint side, this
 * means the most recent confirmed checkpoint).
 */
export const CheckpointParameterSchema = z.union([
  z.object({ number: CheckpointNumberSchema }).strict(),
  z.object({ slot: SlotNumberSchema }).strict(),
  ChainTipSchema,
  z.literal('latest'),
  CheckpointNumberSchema,
]);

export type CheckpointParameter = z.infer<typeof CheckpointParameterSchema>;
