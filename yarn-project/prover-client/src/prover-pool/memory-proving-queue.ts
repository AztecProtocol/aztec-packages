import { InterruptError } from '@aztec/foundation/error';
import { MemoryFifo } from '@aztec/foundation/fifo';
import { createDebugLogger } from '@aztec/foundation/log';

import { type ProvingJob, type ProvingQueue, type ProvingRequestCallback } from './proving-queue.js';
import { type ProvingRequest, type ProvingRequestResult, ProvingRequestType } from './proving-request.js';

type ProvingJobWithResolvers<T extends ProvingRequest = ProvingRequest> = {
  id: string;
  request: T;
  done: ProvingRequestCallback<T['type']>;
};

export class MemoryProvingQueue implements ProvingQueue {
  private jobId = 0;
  private log = createDebugLogger('aztec:prover-client:prover-pool:queue');
  private queue = new MemoryFifo<ProvingJobWithResolvers>();
  private jobsInProgress = new Map<string, ProvingJobWithResolvers>();

  async getProvingJob({ timeoutSec = 1 } = {}): Promise<ProvingJob<ProvingRequest> | null> {
    try {
      const job = await this.queue.get(timeoutSec);
      if (!job) {
        return null;
      }

      this.jobsInProgress.set(job.id, job);
      return {
        id: job.id,
        request: job.request,
      };
    } catch (err) {
      if (err instanceof InterruptError) {
        return null;
      }

      throw err;
    }
  }

  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResult<T>): Promise<void> {
    const job = this.jobsInProgress.get(jobId);
    if (!job) {
      return Promise.reject(new Error('Job not found'));
    }

    this.jobsInProgress.delete(jobId);
    job.done(null, result);
    return Promise.resolve();
  }

  rejectProvingJob(jobId: string, err: any): Promise<void> {
    const job = this.jobsInProgress.get(jobId);
    if (!job) {
      return Promise.reject(new Error('Job not found'));
    }

    this.jobsInProgress.delete(jobId);
    job.done(err, []);
    return Promise.resolve();
  }

  submitProvingRequest<T extends ProvingRequest>(request: T, done: ProvingRequestCallback<T['type']>): void {
    const item: ProvingJobWithResolvers<T> = {
      id: String(this.jobId++),
      request,
      done,
    };

    this.log.info(`Adding ${ProvingRequestType[request.type]} proving job to queue`);
    // TODO (alexg) remove the `any`
    if (!this.queue.put(item as any)) {
      throw new Error();
    }
  }
}
