import { z } from 'zod';

import type { ZodFor } from '../schemas/schemas.js';

/** Options for retrieving txs via {@link AztecNode.getTxByHash} and {@link AztecNode.getTxsByHash}. */
export type GetTxByHashOptions = {
  /** Keep the proof on the returned tx; stripped by default. */
  includeProof?: boolean;
};

/** Zod schema for {@link GetTxByHashOptions}. */
export const GetTxByHashOptionsSchema: ZodFor<GetTxByHashOptions> = z.object({
  includeProof: z.boolean().optional(),
});
