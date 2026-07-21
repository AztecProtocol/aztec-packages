import { CheckpointNumberSchema, SlotNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { CheckpointTagSchema } from './chain_tips.js';

/**
 * Selector for a checkpoint in RPC calls.
 *
 * Accepts a numeric checkpoint number (or `{ number }`), a slot number (`{ slot }`),
 * or a checkpoint-tip name (e.g. `'checkpointed'`, `'proven'`, `'finalized'`).
 */
export const CheckpointParameterSchema = z.union([
  z.object({ number: CheckpointNumberSchema }).strict(),
  z.object({ slot: SlotNumberSchema }).strict(),
  CheckpointTagSchema,
  CheckpointNumberSchema,
]);

export type CheckpointParameter = z.infer<typeof CheckpointParameterSchema>;
