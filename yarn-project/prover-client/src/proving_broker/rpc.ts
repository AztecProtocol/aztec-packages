import {
  type GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  ProvingJobId,
  type ProvingJobProducer,
  ProvingJobStatus,
  ProvingRequestType,
} from '@aztec/circuit-types';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { type SafeJsonRpcServer, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type ApiSchemaFor, optional } from '@aztec/foundation/schemas';

import { z } from 'zod';

const ProvingJobFilterSchema = z.object({
  allowList: z.array(z.nativeEnum(ProvingRequestType)),
});

const GetProvingJobResponse = z.object({
  job: ProvingJob,
  time: z.number(),
});

export const ProvingJobProducerSchema: ApiSchemaFor<ProvingJobProducer> = {
  enqueueProvingJob: z.function().args(ProvingJob).returns(z.boolean()),
  getProvingJobStatus: z.function().args(ProvingJobId).returns(ProvingJobStatus),
  cancelProvingJob: z.function().args(ProvingJobId).returns(z.void()),
  getCompletedJobs: z.function().args(z.array(ProvingJobId)).returns(z.array(ProvingJobId)),
};

export const ProvingJobConsumerSchema: ApiSchemaFor<ProvingJobConsumer> = {
  getProvingJob: z.function().args(optional(ProvingJobFilterSchema)).returns(GetProvingJobResponse.optional()),
  reportProvingJobError: z.function().args(ProvingJobId, z.string(), optional(z.boolean())).returns(z.void()),
  reportProvingJobProgress: z
    .function()
    .args(ProvingJobId, z.number(), optional(ProvingJobFilterSchema))
    .returns(GetProvingJobResponse.optional()),
  reportProvingJobSuccess: z.function().args(ProvingJobId, ProofUri).returns(z.void()),
};

export const ProvingJobBrokerSchema: ApiSchemaFor<ProvingJobBroker> = {
  ...ProvingJobConsumerSchema,
  ...ProvingJobProducerSchema,
};

export function createProvingBrokerServer(broker: ProvingJobBroker): SafeJsonRpcServer {
  return createSafeJsonRpcServer(broker, ProvingJobBrokerSchema);
}

export function createProvingJobBrokerClient(url: string, fetch = makeFetch([1, 2, 3], false)): ProvingJobBroker {
  return createSafeJsonRpcClient(url, ProvingJobBrokerSchema, false, 'proverBroker', fetch);
}

export function createProvingJobProducerClient(url: string, fetch = makeFetch([1, 2, 3], false)): ProvingJobProducer {
  return createSafeJsonRpcClient(url, ProvingJobProducerSchema, false, 'provingJobProducer', fetch);
}

export function createProvingJobConsumerClient(url: string, fetch = makeFetch([1, 2, 3], false)): ProvingJobConsumer {
  return createSafeJsonRpcClient(url, ProvingJobConsumerSchema, false, 'provingJobConsumer', fetch);
}
