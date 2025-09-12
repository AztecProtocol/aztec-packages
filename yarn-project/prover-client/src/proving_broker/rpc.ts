import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import {
  type GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  type ProvingJobBroker,
  type ProvingJobConsumer,
  ProvingJobId,
  type ProvingJobProducer,
  ProvingJobStatus,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { type ApiSchemaFor, optional } from '@aztec/stdlib/schemas';
import { type ComponentsVersions, getVersioningResponseHandler } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

import { z } from 'zod';

const ProvingJobFilterSchema = z.object({
  allowList: z.array(z.nativeEnum(ProvingRequestType)),
});

const GetProvingJobResponse = z.object({
  job: ProvingJob,
  time: z.number(),
});

export const ProvingJobProducerSchema: ApiSchemaFor<ProvingJobProducer> = {
  enqueueProvingJob: z.function().args(ProvingJob).returns(ProvingJobStatus),
  getProvingJobStatus: z.function().args(ProvingJobId).returns(ProvingJobStatus),
  cancelProvingJob: z.function().args(ProvingJobId).returns(z.void()),
  getCompletedJobs: z.function().args(z.array(ProvingJobId)).returns(z.array(ProvingJobId)),
};

export const ProvingJobConsumerSchema: ApiSchemaFor<ProvingJobConsumer> = {
  getProvingJob: z.function().args(optional(ProvingJobFilterSchema)).returns(GetProvingJobResponse.optional()),
  reportProvingJobError: z
    .function()
    .args(ProvingJobId, z.string(), optional(z.boolean()), optional(ProvingJobFilterSchema))
    .returns(GetProvingJobResponse.optional()),
  reportProvingJobProgress: z
    .function()
    .args(ProvingJobId, z.number(), optional(ProvingJobFilterSchema))
    .returns(GetProvingJobResponse.optional()),
  reportProvingJobSuccess: z
    .function()
    .args(ProvingJobId, ProofUri, optional(ProvingJobFilterSchema))
    .returns(GetProvingJobResponse.optional()),
};

export const ProvingJobBrokerSchema: ApiSchemaFor<ProvingJobBroker> = {
  ...ProvingJobConsumerSchema,
  ...ProvingJobProducerSchema,
};

export function createProvingJobBrokerClient(
  url: string,
  versions: Partial<ComponentsVersions>,
  fetch = makeTracedFetch([1, 2, 3], false),
): ProvingJobBroker {
  return createSafeJsonRpcClient(url, ProvingJobBrokerSchema, {
    namespaceMethods: 'proverBroker',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}

export function createProvingJobProducerClient(
  url: string,
  versions: Partial<ComponentsVersions>,
  fetch = makeTracedFetch([1, 2, 3], false),
): ProvingJobProducer {
  return createSafeJsonRpcClient(url, ProvingJobProducerSchema, {
    namespaceMethods: 'provingJobProducer',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}

export function createProvingJobConsumerClient(
  url: string,
  versions: Partial<ComponentsVersions>,
  fetch = makeTracedFetch([1, 2, 3], false),
): ProvingJobConsumer {
  return createSafeJsonRpcClient(url, ProvingJobConsumerSchema, {
    namespaceMethods: 'provingJobConsumer',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}
