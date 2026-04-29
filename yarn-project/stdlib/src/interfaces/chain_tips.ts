import { z } from 'zod';

import { type L2BlockTag, type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';

/**
 * Public chain-tip selectors usable in RPC requests.
 * Omits internal-only tags (e.g. `proposedCheckpoint`) from {@link L2BlockTag}.
 */
export type ChainTip = Exclude<L2BlockTag, 'proposedCheckpoint'>;

export const ChainTipSchema = z.union([
  z.literal('proposed'),
  z.literal('checkpointed'),
  z.literal('proven'),
  z.literal('finalized'),
]) satisfies z.ZodType<ChainTip>;

/**
 * Tips of the L2 chain.
 * Omits the sequencer-internal `proposedCheckpoint` from the public RPC surface.
 */
export type ChainTips = Omit<L2Tips, 'proposedCheckpoint'>;

export const ChainTipsSchema = L2TipsSchema.omit({ proposedCheckpoint: true });
