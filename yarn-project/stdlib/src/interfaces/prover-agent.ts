import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/index.js';

export interface ProverAgentApi {
  setMaxConcurrency(maxConcurrency: number): Promise<void>;

  isRunning(): Promise<boolean>;

  getCurrentJobs(): Promise<{ id: string; type: string }[]>;
}

export const ProverAgentApiSchema: ApiSchemaFor<ProverAgentApi> = {
  setMaxConcurrency: z.function().args(z.number().min(1).int()).returns(z.void()),
  isRunning: z.function().args().returns(z.boolean()),
  getCurrentJobs: z
    .function()
    .args()
    .returns(z.array(z.object({ id: z.string(), type: z.string() }))),
};
