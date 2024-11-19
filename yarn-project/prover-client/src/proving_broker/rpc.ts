import {
  type GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  ProvingJobId,
  type ProvingJobProducer,
  ProvingJobSettledResult,
  ProvingJobStatus,
  ProvingRequestType,
} from '@aztec/circuit-types';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { type SafeJsonRpcServer, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

const ProvingJobFilterSchema = z.object({
  allowList: z.array(z.nativeEnum(ProvingRequestType)),
});

const GetProvingJobResponse = z.object({
  job: ProvingJob,
  time: z.number(),
});

export const ProvingJobProducerSchema: ApiSchemaFor<ProvingJobProducer> = {
  enqueueProvingJob: z.function().args(ProvingJob).returns(z.void()),
  getProvingJobStatus: z.function().args(ProvingJobId).returns(ProvingJobStatus),
  removeAndCancelProvingJob: z.function().args(ProvingJobId).returns(z.void()),
  waitForJobToSettle: z.function().args(ProvingJobId).returns(ProvingJobSettledResult),
};

// can't use ApiSchemaFor because of the optional parameters
export const ProvingJobConsumerSchema = {
  getProvingJob: z.function().args(ProvingJobFilterSchema.optional()).returns(GetProvingJobResponse.optional()),
  reportProvingJobError: z.function().args(ProvingJobId, z.string(), z.boolean().optional()).returns(z.void()),
  reportProvingJobProgress: z
    .function()
    .args(ProvingJobId, z.number(), ProvingJobFilterSchema.optional())
    .returns(GetProvingJobResponse.optional()),
  reportProvingJobSuccess: z.function().args(ProvingJobId, ProofUri).returns(z.void()),
} as unknown as ApiSchemaFor<ProvingJobConsumer>;

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
