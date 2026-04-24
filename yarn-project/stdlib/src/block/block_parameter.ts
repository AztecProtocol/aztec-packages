import { BlockNumberSchema } from '@aztec/foundation/branded-types';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { ChainTipSchema } from '../interfaces/chain_tips.js';
import { BlockHash } from './block_hash.js';

/**
 * Selector for a block in RPC calls.
 *
 * Accepts a block number, a {@link BlockHash}, a chain-tip name (e.g. `'proven'`, `'checkpointed'`),
 * `'latest'` (alias for `'proposed'`), or the explicit object variants `{ number }`, `{ hash }`,
 * and `{ archive }`.
 */
export const BlockParameterSchema = z.union([
  BlockHash.schema,
  BlockNumberSchema,
  ChainTipSchema,
  z.literal('latest'),
  z.object({ number: BlockNumberSchema }),
  z.object({ hash: BlockHash.schema }),
  z.object({ archive: schemas.Fr }),
]);

export type BlockParameter = z.infer<typeof BlockParameterSchema>;
