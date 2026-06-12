import { z } from 'zod';

/**
 * Public checkpoint-tip selectors usable in RPC requests.
 *
 * `'proposed'` is intentionally excluded: the proposed-but-unconfirmed checkpoint frontier is an
 * archiver-internal pipelining concept, not part of the public chain-tip surface. Select the
 * proposed *block* tip with a block tag (`L2BlockTag`) instead.
 */
export type CheckpointTag = 'checkpointed' | 'proven' | 'finalized';

export const CheckpointTagSchema = z.union([
  z.literal('checkpointed'),
  z.literal('proven'),
  z.literal('finalized'),
]) satisfies z.ZodType<CheckpointTag>;
