import { z } from 'zod';

import { type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';
import { type ApiSchemaFor, schemas } from '../schemas/index.js';
import { type WorldStateSyncStatus, WorldStateSyncStatusSchema } from './world_state.js';

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

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]>;

  startProof(epochNumber: number): Promise<void>;

  getL2Tips(): Promise<L2Tips>;

  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus>;
}

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getJobs: z.function({
    input: z.tuple([]),
    output: z.array(z.object({ uuid: z.string(), status: z.enum(EpochProvingJobState), epochNumber: z.number() })),
  }),

  startProof: z.function({ input: z.tuple([schemas.Integer]), output: z.void() }),

  getL2Tips: z.function({ input: z.tuple([]), output: L2TipsSchema }),

  getWorldStateSyncStatus: z.function({ input: z.tuple([]), output: WorldStateSyncStatusSchema }),
};
