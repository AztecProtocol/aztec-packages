import { z } from 'zod';

import { ExtendedPublicLog } from '../logs/extended_public_log.js';
import { ExtendedUnencryptedL2Log } from '../logs/extended_unencrypted_l2_log.js';
import type { ZodFor } from '../schemas/index.js';

/** Response for the getContractClassLogs archiver call. */
export type GetContractClassLogsResponse = {
  /** An array of ExtendedUnencryptedL2Log elements. */
  logs: ExtendedUnencryptedL2Log[];
  /** Indicates if a limit has been reached. */
  maxLogsHit: boolean;
};

export const GetContractClassLogsResponseSchema: ZodFor<GetContractClassLogsResponse> = z.object({
  logs: z.array(ExtendedUnencryptedL2Log.schema),
  maxLogsHit: z.boolean(),
});

/** Response for the getPublicLogs archiver call. */
export type GetPublicLogsResponse = {
  /** An array of ExtendedPublicLog elements. */
  logs: ExtendedPublicLog[];
  /** Indicates if a limit has been reached. */
  maxLogsHit: boolean;
};

export const GetPublicLogsResponseSchema = z.object({
  logs: z.array(ExtendedPublicLog.schema),
  maxLogsHit: z.boolean(),
}) satisfies ZodFor<GetPublicLogsResponse>;
