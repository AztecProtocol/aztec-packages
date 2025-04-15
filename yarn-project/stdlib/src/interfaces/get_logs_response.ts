import { z } from 'zod';

import { ExtendedContractClassLog } from '../logs/extended_contract_class_log.js';
import { ExtendedPublicLog } from '../logs/extended_public_log.js';
import type { ZodFor } from '../schemas/index.js';

/** Response for the getContractClassLogs archiver call. */
export type GetContractClassLogsResponse = {
  /** An array of ExtendedContractClassLog elements. */
  logs: ExtendedContractClassLog[];
  /** Indicates if a limit has been reached. */
  maxLogsHit: boolean;
};

export const GetContractClassLogsResponseSchema: ZodFor<GetContractClassLogsResponse> = z.object({
  logs: z.array(ExtendedContractClassLog.schema),
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
