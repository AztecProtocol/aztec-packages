import type { ProvingRequest, ProvingRequestResult, ProvingRequestType } from './proving-request.js';

export type GetJobOptions = {
  timeoutSec?: number;
};

export type ProvingJob<T extends ProvingRequest> = {
  id: string;
  request: T;
};

export interface ProvingRequestCallback<T extends ProvingRequestType> {
  (error: Error, result: []): void;
  (error: null, result: ProvingRequestResult<T>): void;
}

export interface ProvingRequestProducer {
  submitProvingRequest<T extends ProvingRequest>(request: T, callback: ProvingRequestCallback<T['type']>): void;
}

export interface ProvingQueueConsumer {
  getProvingJob(options?: GetJobOptions): Promise<ProvingJob<ProvingRequest> | null>;
  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResult<T>): Promise<void>;
  rejectProvingJob(jobId: string, reason: Error): Promise<void>;
}

export interface ProvingQueue extends ProvingQueueConsumer, ProvingRequestProducer {}
