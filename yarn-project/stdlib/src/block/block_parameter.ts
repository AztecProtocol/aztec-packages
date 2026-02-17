import { BlockNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { BlockHash } from './block_hash.js';

export const BlockParameterSchema = z.union([BlockHash.schema, BlockNumberSchema, z.literal('latest')]);

/** Block parameter - either a specific BlockNumber, block hash (BlockHash), or 'latest' */
export type BlockParameter = z.infer<typeof BlockParameterSchema>;
