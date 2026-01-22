import { BlockNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { L2BlockHash } from './block_hash.js';

export const BlockParameterSchema = z.union([L2BlockHash.schema, BlockNumberSchema, z.literal('latest')]);

/** Block parameter - either a specific BlockNumber, block hash (L2BlockHash), or 'latest' */
export type BlockParameter = z.infer<typeof BlockParameterSchema>;
