import { z } from 'zod';

import { type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';
import { type ApiSchemaFor, schemas } from '../schemas/index.js';
import { type WorldStateSyncStatus, WorldStateSyncStatusSchema } from './world_state.js';

const EpochProvingJobState = [
  'initialized',
  'processing',
  'awaiting-prover',
  'publishing-proof',
  'completed',
  'failed',
  'stopped',
  'timed-out',
  'reorg',
] as const;

export type EpochProvingJobState = (typeof EpochProvingJobState)[number];

export const EpochProvingJobTerminalState: EpochProvingJobState[] = [
  'completed',
  'failed',
  'stopped',
  'timed-out',
  'reorg',
] as const;

export type EpochProvingJobTerminalState = (typeof EpochProvingJobTerminalState)[number];

const EpochProvingJobStateTransitionSchema = z.object({
  state: z.enum(EpochProvingJobState),
  startedAt: z.number().int().nonnegative(),
});

/** A recorded state change for an epoch proving job. */
export type EpochProvingJobStateTransition = z.infer<typeof EpochProvingJobStateTransitionSchema>;

const ProverNodeJobSchema = z.object({
  uuid: z.string(),
  status: z.enum(EpochProvingJobState),
  epochNumber: z.number(),
  startedAt: z.number().int().nonnegative(),
  stateTransitions: z.array(EpochProvingJobStateTransitionSchema),
  checkpointCount: z.number().int().nonnegative(),
  totalCheckpointCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  totalBlockCount: z.number().int().nonnegative(),
  txCount: z.number().int().nonnegative(),
  totalTxCount: z.number().int().nonnegative(),
});

/** Public status summary for an epoch proving job. */
export type ProverNodeJob = z.infer<typeof ProverNodeJobSchema>;

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<ProverNodeJob[]>;

  startProof(epochNumber: number): Promise<void>;

  getL2Tips(): Promise<L2Tips>;

  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus>;
}

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getJobs: z.function({
    input: z.tuple([]),
    output: z.array(ProverNodeJobSchema),
  }),

  startProof: z.function({ input: z.tuple([schemas.Integer]), output: z.void() }),

  getL2Tips: z.function({ input: z.tuple([]), output: L2TipsSchema }),

  getWorldStateSyncStatus: z.function({ input: z.tuple([]), output: WorldStateSyncStatusSchema }),
};
