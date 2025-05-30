import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/index.js';

export const ProverAgentStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('stopped') }),
  z.object({ status: z.literal('running') }),
  z.object({ status: z.literal('proving'), jobId: z.string(), proofType: z.number(), startedAtISO: z.string() }),
]);

export type ProverAgentStatus = z.infer<typeof ProverAgentStatusSchema>;

export interface ProverAgentApi {
  getStatus(): Promise<unknown>;
}

export const ProverAgentApiSchema: ApiSchemaFor<ProverAgentApi> = {
  getStatus: z.function().args().returns(ProverAgentStatusSchema),
};
