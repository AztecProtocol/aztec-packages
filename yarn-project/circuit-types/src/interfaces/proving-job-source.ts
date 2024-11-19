import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { ProvingJob, ProvingJobId, ProvingJobResult } from './proving-job.js';

export interface ProvingJobSource {
  /**
   * Gets the next proving job. `heartbeat` must be called periodically to keep the job alive.
   * @returns The proving job, or undefined if there are no jobs available.
   */
  getProvingJob(): Promise<ProvingJob | undefined>;

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
  resolveProvingJob(jobId: string, result: ProvingJobResult): Promise<void>;

  /**
   * Rejects a proving job.
   * @param jobId - The ID of the job to reject.
   * @param reason - The reason for rejecting the job.
   */
  rejectProvingJob(jobId: string, reason: string): Promise<void>;
}

export const ProvingJobSourceSchema: ApiSchemaFor<ProvingJobSource> = {
  getProvingJob: z.function().args().returns(ProvingJob.optional()),
  heartbeat: z.function().args(ProvingJobId).returns(z.void()),
  resolveProvingJob: z.function().args(ProvingJobId, ProvingJobResult).returns(z.void()),
  rejectProvingJob: z.function().args(ProvingJobId, z.string()).returns(z.void()),
};
