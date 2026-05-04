import { CheckpointNumberSchema, SlotNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import type { CheckpointQuery, ProposedCheckpointQuery } from '../block/l2_block_source.js';
import { ChainTipSchema } from './chain_tips.js';

/**
 * Normalized form of a checkpoint lookup used internally by the node.
 *
 * After normalization the raw {@link CheckpointParameter} is split into its
 * confirmed/proposed variants so the node can dispatch to the right source.
 */
export type NormalizedCheckpointDispatch = {
  confirmed?: CheckpointQuery;
  proposed?: ProposedCheckpointQuery;
  isProposedTag: boolean;
};

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
