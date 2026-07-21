import { EpochNumberSchema } from '@aztec/foundation/branded-types';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import {
  type GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  type ProvingJobBroker,
  type ProvingJobBrokerDebug,
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

/** Indefinite backoff for broker communication: 1, 1, 1, 2, 4, 4, 4, ... seconds. */
export function* proverBrokerBackoff() {
  const v = [1, 1, 1, 2, 4];
  let i = 0;
  while (true) {
    yield v[Math.min(i++, v.length - 1)];
  }
}

const ProvingJobFilterSchema = z.object({
  allowList: z.array(z.nativeEnum(ProvingRequestType)),
});

const GetProvingJobResponse = z.object({
  job: ProvingJob,
  time: z.number(),
});

export const ProvingJobProducerSchema: ApiSchemaFor<ProvingJobProducer> = {
  enqueueProvingJob: z.function({ input: z.tuple([ProvingJob]), output: ProvingJobStatus }),
  getProvingJobStatus: z.function({ input: z.tuple([ProvingJobId]), output: ProvingJobStatus }),
  cancelProvingJob: z.function({ input: z.tuple([ProvingJobId]), output: z.void() }),
  getCompletedJobs: z.function({ input: z.tuple([z.array(ProvingJobId)]), output: z.array(ProvingJobId) }),
};

export const ProvingJobConsumerSchema: ApiSchemaFor<ProvingJobConsumer> = {
  getProvingJob: z.function({
    input: z.tuple([optional(ProvingJobFilterSchema)]),
    output: GetProvingJobResponse.optional(),
  }),
  reportProvingJobError: z.function({
    input: z.tuple([ProvingJobId, z.string(), optional(z.boolean()), optional(ProvingJobFilterSchema)]),
    output: GetProvingJobResponse.optional(),
  }),
  reportProvingJobProgress: z.function({
    input: z.tuple([ProvingJobId, z.number(), optional(ProvingJobFilterSchema)]),
    output: GetProvingJobResponse.optional(),
  }),
  reportProvingJobSuccess: z.function({
    input: z.tuple([ProvingJobId, ProofUri, optional(ProvingJobFilterSchema)]),
    output: GetProvingJobResponse.optional(),
  }),
};

export const ProvingJobBrokerSchema: ApiSchemaFor<ProvingJobBroker> = {
  ...ProvingJobConsumerSchema,
  ...ProvingJobProducerSchema,
};

export const ProvingJobBrokerDebugSchema: ApiSchemaFor<ProvingJobBrokerDebug> = {
  replayProvingJob: z.function({
    input: z.tuple([ProvingJobId, z.nativeEnum(ProvingRequestType), EpochNumberSchema, ProofUri]),
    output: ProvingJobStatus,
  }),
};

export const ProvingJobBrokerSchemaWithDebug: ApiSchemaFor<ProvingJobBroker & ProvingJobBrokerDebug> = {
  ...ProvingJobBrokerSchema,
  ...ProvingJobBrokerDebugSchema,
};

export function createProvingJobBrokerClient(
  url: string,
  versions: Partial<ComponentsVersions>,
  fetch = makeTracedFetch(proverBrokerBackoff, false),
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
  fetch = makeTracedFetch(proverBrokerBackoff, false),
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
  fetch = makeTracedFetch(proverBrokerBackoff, false),
): ProvingJobConsumer {
  return createSafeJsonRpcClient(url, ProvingJobConsumerSchema, {
    namespaceMethods: 'provingJobConsumer',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}
