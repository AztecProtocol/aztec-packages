import { z } from 'zod';

import { schemas } from '../schemas/index.js';

export const L2BlockNumberSchema = z.union([schemas.Integer, z.literal('latest')]);

/** Helper type for a specific L2 block number or the latest block number */
export type L2BlockNumber = z.infer<typeof L2BlockNumberSchema>;
