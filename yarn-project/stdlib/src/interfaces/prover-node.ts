import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import { type ApiSchemaFor, schemas } from '../schemas/index.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';

const EpochProvingJobState = [
  'initialized',
  'awaiting-checkpoints',
  'awaiting-predecessor',
  'publishing-proof',
  'completed',
  'superseded',
  'failed',
  'stopped',
  'cancelled',
  'timed-out',
] as const;

export type EpochProvingJobState = (typeof EpochProvingJobState)[number];

export const EpochProvingJobTerminalState: EpochProvingJobState[] = [
  'completed',
  'superseded',
  'failed',
  'stopped',
  'cancelled',
  'timed-out',
] as const;

export type EpochProvingJobTerminalState = (typeof EpochProvingJobTerminalState)[number];

/** JSON RPC admin interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]>;

  /**
   * Schedules proving for the given epoch and returns the job id immediately, without waiting for
   * the proof to complete (proving can take far longer than an HTTP request). Poll `getJobs()` to
   * track the returned job's progress.
   */
  startProof(epochNumber: number): Promise<string>;
}

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getJobs: z.function({
    input: z.tuple([]),
    output: z.array(z.object({ uuid: z.string(), status: z.enum(EpochProvingJobState), epochNumber: z.number() })),
  }),

  startProof: z.function({ input: z.tuple([schemas.Integer]), output: z.string() }),
};

export function createProverNodeAdminClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = defaultFetch,
  apiKey?: string,
): ProverNodeApi {
  return createSafeJsonRpcClient<ProverNodeApi>(url, ProverNodeApiSchema, {
    namespaceMethods: 'prover',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
    ...(apiKey ? { extraHeaders: { 'x-api-key': apiKey } } : {}),
  });
}
