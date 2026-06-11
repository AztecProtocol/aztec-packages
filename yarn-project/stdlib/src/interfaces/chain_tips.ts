import { z } from 'zod';

import { type L2BlockTag, type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';

/** Public chain-tip selectors usable in RPC requests. */
export type ChainTip = L2BlockTag;

export const ChainTipSchema = z.union([
  z.literal('proposed'),
  z.literal('checkpointed'),
  z.literal('proven'),
  z.literal('finalized'),
]) satisfies z.ZodType<ChainTip>;

/** Tips of the L2 chain. */
export type ChainTips = L2Tips;

export const ChainTipsSchema = L2TipsSchema;
