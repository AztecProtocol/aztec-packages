import { BlockNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

export const BlockParameterSchema = z.union([BlockNumberSchema, z.literal('latest')]);

/** Block parameter - either a specific BlockNumber or 'latest' */
export type BlockParameter = z.infer<typeof BlockParameterSchema>;
