import { ExtendedPublicLog, ExtendedUnencryptedL2Log } from '@aztec/circuits.js/logs';
import { type ZodFor } from '@aztec/circuits.js/schemas';

import { z } from 'zod';

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
