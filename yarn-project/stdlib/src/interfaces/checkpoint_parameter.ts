import { CheckpointNumberSchema, SlotNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { ChainTipSchema } from './chain_tips.js';

/**
 * Selector for a checkpoint in RPC calls.
 *
 * Accepts a numeric checkpoint number (or `{ number }`), a slot number (`{ slot }`),
 * or a chain-tip name (e.g. `'proposed'`, `'proven'`).
 */
export const CheckpointParameterSchema = z.union([
  z.object({ number: CheckpointNumberSchema }).strict(),
  z.object({ slot: SlotNumberSchema }).strict(),
  ChainTipSchema,
  CheckpointNumberSchema,
]);

export type CheckpointParameter = z.infer<typeof CheckpointParameterSchema>;
