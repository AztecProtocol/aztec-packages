import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import {
  JobIdSchema,
  type ProvingJob,
  ProvingJobSchema,
  type ProvingRequest,
  type ProvingRequestResult,
  ProvingRequestResultSchema,
} from './proving-job.js';

export interface ProvingJobSource {
  /**
   * Gets the next proving job. `heartbeat` must be called periodically to keep the job alive.
   * @returns The proving job, or undefined if there are no jobs available.
   */
  getProvingJob(): Promise<ProvingJob<ProvingRequest> | undefined>;

  /**
   * Keeps the job alive. If this isn't called regularly then the job will be
   * considered abandoned and re-queued for another consumer to pick up
   * @param jobId The ID of the job to heartbeat.
   */
  heartbeat(jobId: string): Promise<void>;

  /**
   * Resolves a proving job.
   * @param jobId - The ID of the job to resolve.
   * @param result - The result of the proving job.
   */
  resolveProvingJob(jobId: string, result: ProvingRequestResult): Promise<void>;

  /**
   * Rejects a proving job.
   * @param jobId - The ID of the job to reject.
   * @param reason - The reason for rejecting the job.
   */
  rejectProvingJob(jobId: string, reason: string): Promise<void>;
}

export const ProvingJobSourceSchema: ApiSchemaFor<ProvingJobSource> = {
  getProvingJob: z.function().args().returns(ProvingJobSchema.optional()),
  heartbeat: z.function().args(JobIdSchema).returns(z.void()),
  resolveProvingJob: z.function().args(JobIdSchema, ProvingRequestResultSchema).returns(z.void()),
  rejectProvingJob: z.function().args(JobIdSchema, z.string()).returns(z.void()),
};
