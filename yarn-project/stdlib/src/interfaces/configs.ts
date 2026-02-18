import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Prettify } from '@aztec/foundation/types';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { schemas, zodFor } from '../schemas/index.js';
import { type AllowedElement, AllowedElementSchema } from './allowed_element.js';

/** Sequencer configuration */
export interface SequencerConfig {
  /** The number of ms to wait between polling for pending txs. */
  sequencerPollingIntervalMS?: number;
  /** The maximum number of txs to include in a block. */
  maxTxsPerBlock?: number;
  /** The minimum number of txs to include in a block. */
  minTxsPerBlock?: number;
  /** The minimum number of valid txs (after execution) to include in a block. If not set, falls back to minTxsPerBlock. */
  minValidTxsPerBlock?: number;
  /** Whether to publish txs with the block proposals */
  publishTxsWithProposals?: boolean;
  /** The maximum L2 block gas. */
  maxL2BlockGas?: number;
  /** The maximum DA block gas. */
  maxDABlockGas?: number;
  /** Recipient of block reward. */
  coinbase?: EthAddress;
  /** Address to receive fees. */
  feeRecipient?: AztecAddress;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory?: string;
  /** The path to the ACVM binary */
  acvmBinaryPath?: string;
  /** The list of functions calls allowed to run in setup */
  txPublicSetupAllowList?: AllowedElement[];
  /** Max block size */
  maxBlockSizeInBytes?: number;
  /** Payload address to vote for */
  governanceProposerPayload?: EthAddress;
  /** Whether to enforce the time table when building blocks */
  enforceTimeTable?: boolean;
  /** How much time (in seconds) we allow in the slot for publishing the L1 tx. */
  l1PublishingTime?: number;
  /** Used for testing to introduce a fake delay after processing each tx */
  fakeProcessingDelayPerTxMs?: number;
  /** Used for testing to throw an error after processing N txs */
  fakeThrowAfterProcessingTxCount?: number;
  /** How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way) */
  attestationPropagationTime?: number;
  /** How many seconds before invalidating a block as a committee member (zero to never invalidate) */
  secondsBeforeInvalidatingBlockAsCommitteeMember?: number;
  /** How many seconds before invalidating a block as a non-committee member (zero to never invalidate) */
  secondsBeforeInvalidatingBlockAsNonCommitteeMember?: number;
  /** Skip collecting attestations (for testing only) */
  skipCollectingAttestations?: boolean;
  /** Do not invalidate the previous block if invalid when we are the proposer (for testing only) */
  skipInvalidateBlockAsProposer?: boolean;
  /** Broadcast invalid block proposals with corrupted state (for testing only) */
  broadcastInvalidBlockProposal?: boolean;
  /** Inject a fake attestation (for testing only) */
  injectFakeAttestation?: boolean;
  /** Whether to run in fisherman mode: builds blocks on every slot for validation without publishing */
  fishermanMode?: boolean;
  /** Shuffle attestation ordering to create invalid ordering (for testing only) */
  shuffleAttestationOrdering?: boolean;
  /** Duration per block in milliseconds when building multiple blocks per slot (default: undefined = single block per slot) */
  blockDurationMs?: number;
  /** Have sequencer build and publish an empty checkpoint if there are no txs */
  buildCheckpointIfEmpty?: boolean;
  /** Skip pushing proposed blocks to archiver (default: false) */
  skipPushProposedBlocksToArchiver?: boolean;
  /** Minimum number of blocks required for a checkpoint proposal (test only, defaults to undefined = no minimum) */
  minBlocksForCheckpoint?: number;
  /** Skip publishing checkpoint proposals probability (for testing checkpoint prunes only) */
  skipPublishingCheckpointsPercent?: number;
}

export const SequencerConfigSchema = zodFor<SequencerConfig>()(
  z.object({
    sequencerPollingIntervalMS: z.number().optional(),
    maxTxsPerBlock: z.number().optional(),
    minValidTxsPerBlock: z.number().optional(),
    minTxsPerBlock: z.number().optional(),
    maxL2BlockGas: z.number().optional(),
    publishTxsWithProposals: z.boolean().optional(),
    maxDABlockGas: z.number().optional(),
    coinbase: schemas.EthAddress.optional(),
    feeRecipient: schemas.AztecAddress.optional(),
    acvmWorkingDirectory: z.string().optional(),
    acvmBinaryPath: z.string().optional(),
    txPublicSetupAllowList: z.array(AllowedElementSchema).optional(),
    maxBlockSizeInBytes: z.number().optional(),
    governanceProposerPayload: schemas.EthAddress.optional(),
    l1PublishingTime: z.number().optional(),
    enforceTimeTable: z.boolean().optional(),
    fakeProcessingDelayPerTxMs: z.number().optional(),
    fakeThrowAfterProcessingTxCount: z.number().optional(),
    attestationPropagationTime: z.number().optional(),
    skipCollectingAttestations: z.boolean().optional(),
    skipInvalidateBlockAsProposer: z.boolean().optional(),
    secondsBeforeInvalidatingBlockAsCommitteeMember: z.number(),
    secondsBeforeInvalidatingBlockAsNonCommitteeMember: z.number(),
    broadcastInvalidBlockProposal: z.boolean().optional(),
    injectFakeAttestation: z.boolean().optional(),
    fishermanMode: z.boolean().optional(),
    shuffleAttestationOrdering: z.boolean().optional(),
    blockDurationMs: z.number().positive().optional(),
    buildCheckpointIfEmpty: z.boolean().optional(),
    skipPushProposedBlocksToArchiver: z.boolean().optional(),
    minBlocksForCheckpoint: z.number().positive().optional(),
    skipPublishingCheckpointsPercent: z.number().gte(0).lte(100).optional(),
  }),
);

type SequencerConfigOptionalKeys =
  | 'governanceProposerPayload'
  | 'blockDurationMs'
  | 'coinbase'
  | 'feeRecipient'
  | 'acvmWorkingDirectory'
  | 'acvmBinaryPath'
  | 'fakeProcessingDelayPerTxMs'
  | 'fakeThrowAfterProcessingTxCount'
  | 'l1PublishingTime'
  | 'txPublicSetupAllowList'
  | 'minValidTxsPerBlock'
  | 'minBlocksForCheckpoint';

export type ResolvedSequencerConfig = Prettify<
  Required<Omit<SequencerConfig, SequencerConfigOptionalKeys>> & Pick<SequencerConfig, SequencerConfigOptionalKeys>
>;
