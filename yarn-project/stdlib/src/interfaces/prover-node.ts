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

export type ProverNodeProvingProgress = {
  active: boolean;
  epochNumber?: number;
  activeForks?: number;
  pendingProvingJobs?: number;
  totalCheckpoints?: number;
  startedCheckpoints?: number;
  provenCheckpoints?: number;
  totalBlocks?: number;
  startedBlocks?: number;
  provenBlocks?: number;
  totalTxs?: number;
  addedTxs?: number;
  provenTxs?: number;
  cachedChonkVerifierProofs?: number;
  rootProofStarted?: boolean;
  rootProofCompleted?: boolean;
  finalBlobReady?: boolean;
  updatedAt?: string;
};

export type ProverNodeJobProgress = {
  startedAt: string;
  updatedAt: string;
  stateEnteredAt: string;
  finishedAt?: string;
  deadline?: string;
  fromCheckpoint?: number;
  toCheckpoint?: number;
  fromBlock?: number;
  toBlock?: number;
  totalCheckpoints: number;
  processedCheckpoints: number;
  totalBlocks: number;
  processedBlocks: number;
  totalTxs: number;
  processedTxs: number;
  currentCheckpoint?: number;
  currentCheckpointIndexInEpoch?: number;
  currentCheckpointSlotInEpoch?: number;
  currentBlock?: number;
  currentBlockIndexInCheckpoint?: number;
  currentBlockCountInCheckpoint?: number;
  percentage: number;
  error?: string;
  proving?: ProverNodeProvingProgress;
};

export type ProverNodeChainTipState = {
  blockNumber: number;
  blockHash?: string;
  slotNumber?: number;
  slotInEpoch?: number;
  checkpointNumber?: number;
  checkpointSlotInEpoch?: number;
  blockIndexInCheckpoint?: number;
  blockCountInCheckpoint?: number;
};

export type ProverNodeJobStatus = {
  uuid: string;
  status: EpochProvingJobState;
  epochNumber: number;
  progress?: ProverNodeJobProgress;
};

export type ProverNodeStatus = {
  updatedAt: string;
  proverId?: string;
  currentEpoch: number;
  chainTipState?: ProverNodeChainTipState;
  l2Tips: L2Tips;
  worldState: WorldStateSyncStatus;
  jobs: ProverNodeJobStatus[];
};

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getStatus(): Promise<ProverNodeStatus>;

  getJobs(): Promise<ProverNodeJobStatus[]>;

  startProof(epochNumber: number): Promise<void>;

  getL2Tips(): Promise<L2Tips>;

  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus>;
}

const ProverNodeProvingProgressSchema = z
  .object({
    active: z.boolean(),
    epochNumber: schemas.EpochNumber.optional(),
    activeForks: schemas.Integer.optional(),
    pendingProvingJobs: schemas.Integer.optional(),
    totalCheckpoints: schemas.Integer.optional(),
    startedCheckpoints: schemas.Integer.optional(),
    provenCheckpoints: schemas.Integer.optional(),
    totalBlocks: schemas.Integer.optional(),
    startedBlocks: schemas.Integer.optional(),
    provenBlocks: schemas.Integer.optional(),
    totalTxs: schemas.Integer.optional(),
    addedTxs: schemas.Integer.optional(),
    provenTxs: schemas.Integer.optional(),
    cachedChonkVerifierProofs: schemas.Integer.optional(),
    rootProofStarted: z.boolean().optional(),
    rootProofCompleted: z.boolean().optional(),
    finalBlobReady: z.boolean().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const ProverNodeJobProgressSchema = z
  .object({
    startedAt: z.string(),
    updatedAt: z.string(),
    stateEnteredAt: z.string(),
    finishedAt: z.string().optional(),
    deadline: z.string().optional(),
    fromCheckpoint: schemas.Integer.optional(),
    toCheckpoint: schemas.Integer.optional(),
    fromBlock: schemas.Integer.optional(),
    toBlock: schemas.Integer.optional(),
    totalCheckpoints: schemas.Integer,
    processedCheckpoints: schemas.Integer,
    totalBlocks: schemas.Integer,
    processedBlocks: schemas.Integer,
    totalTxs: schemas.Integer,
    processedTxs: schemas.Integer,
    currentCheckpoint: schemas.Integer.optional(),
    currentCheckpointIndexInEpoch: schemas.Integer.optional(),
    currentCheckpointSlotInEpoch: schemas.Integer.optional(),
    currentBlock: schemas.Integer.optional(),
    currentBlockIndexInCheckpoint: schemas.Integer.optional(),
    currentBlockCountInCheckpoint: schemas.Integer.optional(),
    percentage: z.number(),
    error: z.string().optional(),
    proving: ProverNodeProvingProgressSchema.optional(),
  })
  .passthrough();

const ProverNodeChainTipStateSchema = z
  .object({
    blockNumber: schemas.Integer,
    blockHash: z.string().optional(),
    slotNumber: schemas.Integer.optional(),
    slotInEpoch: schemas.Integer.optional(),
    checkpointNumber: schemas.Integer.optional(),
    checkpointSlotInEpoch: schemas.Integer.optional(),
    blockIndexInCheckpoint: schemas.Integer.optional(),
    blockCountInCheckpoint: schemas.Integer.optional(),
  })
  .passthrough();

const ProverNodeJobStatusSchema = z
  .object({
    uuid: z.string(),
    status: z.enum(EpochProvingJobState),
    epochNumber: schemas.EpochNumber,
    progress: ProverNodeJobProgressSchema.optional(),
  })
  .passthrough();

const ProverNodeStatusSchema = z
  .object({
    updatedAt: z.string(),
    proverId: z.string().optional(),
    currentEpoch: schemas.EpochNumber,
    chainTipState: ProverNodeChainTipStateSchema.optional(),
    l2Tips: L2TipsSchema,
    worldState: WorldStateSyncStatusSchema,
    jobs: z.array(ProverNodeJobStatusSchema),
  })
  .passthrough();

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getStatus: z.function().args().returns(ProverNodeStatusSchema),

  getJobs: z.function().args().returns(z.array(ProverNodeJobStatusSchema)),

  startProof: z.function().args(schemas.Integer).returns(z.void()),

  getL2Tips: z.function().args().returns(L2TipsSchema),

  getWorldStateSyncStatus: z.function().args().returns(WorldStateSyncStatusSchema),
};
