import { type SlotNumber, SlotNumberSchema } from '@aztec/foundation/branded-types';
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
  /** The maximum number of txs across all blocks in a checkpoint. */
  maxTxsPerCheckpoint?: number;
  /** Maximum number of blocks the sequencer packs into a single checkpoint, and the highest indexWithinCheckpoint accepted on a block proposal. */
  maxBlocksPerCheckpoint?: number;
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
  /** Per-block gas budget multiplier for both L2 and DA gas. Budget = (checkpointLimit / maxBlocks) * multiplier. */
  perBlockAllocationMultiplier?: number;
  /**
   * Per-block budget multiplier applied to DA gas and blob fields in place of `perBlockAllocationMultiplier`.
   * Defaults higher than the general multiplier so the largest contract class deploy fits a single block.
   */
  perBlockDAAllocationMultiplier?: number;
  /** Redistribute remaining checkpoint budget evenly across remaining blocks instead of allowing a single block to consume the entire remaining budget. */
  redistributeCheckpointBudget?: boolean;
  /** Recipient of block reward. */
  coinbase?: EthAddress;
  /** Address to receive fees. */
  feeRecipient?: AztecAddress;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory?: string;
  /** The path to the ACVM binary */
  acvmBinaryPath?: string;
  /** Additional entries to extend the default setup allow list. */
  txPublicSetupAllowListExtend?: AllowedElement[];
  /** Payload address to vote for */
  governanceProposerPayload?: EthAddress;
  /**
   * Minimum block-building time (`min_block_duration`) still worth allocating if the proposer starts
   * late, in seconds.
   */
  minBlockDuration?: number;
  /**
   * Local time (`checkpoint_proposal_prepare_time`) between the last block build finishing and the
   * checkpoint proposal being ready for p2p send, in seconds.
   */
  checkpointProposalPrepareTime?: number;
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
  /**
   * Bypass the parent checkpoint validity check before submitting a pipelined checkpoint, allowing
   * the proposer to publish even when the parent landed on L1 with invalid attestations (for testing only).
   */
  skipWaitForValidParentCheckpointOnL1?: boolean;
  /** Broadcast invalid block proposals with corrupted state (for testing only) */
  broadcastInvalidBlockProposal?: boolean;
  /** Broadcast an invalid block proposal only at this indexWithinCheckpoint (for testing only) */
  invalidBlockProposalIndexWithinCheckpoint?: number;
  /**
   * Broadcast invalid checkpoint proposals (with corrupted archive) while keeping the underlying
   * block proposals valid (for testing only). When unset, the checkpoint follows
   * `broadcastInvalidBlockProposal`.
   */
  broadcastInvalidCheckpointProposalOnly?: boolean;
  /** Inject a fake attestation (for testing only) */
  injectFakeAttestation?: boolean;
  /** Inject a malleable attestation with a high-s value (for testing only) */
  injectHighSValueAttestation?: boolean;
  /** Inject an attestation with an unrecoverable signature (for testing only) */
  injectUnrecoverableSignatureAttestation?: boolean;
  /** Whether to run in fisherman mode: builds blocks on every slot for validation without publishing */
  fishermanMode?: boolean;
  /** Shuffle attestation ordering to create invalid ordering (for testing only) */
  shuffleAttestationOrdering?: boolean;
  /** Duration per block in milliseconds, used to derive how many blocks fit in a slot (defaults to 3000 ms). */
  blockDurationMs?: number;
  /** Consensus grace in seconds for a received checkpoint proposal to materialize into local proposed state. */
  checkpointProposalSyncGraceSeconds?: number;
  /** Expected number of block proposals per slot for P2P peer scoring. 0 disables scoring, undefined falls back to blocksPerSlot - 1. */
  expectedBlockProposalsPerSlot?: number;
  /** Have sequencer build and publish an empty checkpoint if there are no txs */
  buildCheckpointIfEmpty?: boolean;
  /**
   * On the final block of a checkpoint, wait until the block build deadline before sealing rather than
   * sealing as soon as `minTxsPerBlock` are available. This lets a burst of txs submitted late in the slot
   * all land in the final block instead of spilling into the next checkpoint (for testing only).
   */
  waitForBuildDeadlineOnFinalBlock?: boolean;
  /** Skip pushing proposed blocks to archiver (default: false) */
  skipPushProposedBlocksToArchiver?: boolean;
  /** Minimum number of blocks required for a checkpoint proposal (test only, defaults to undefined = no minimum) */
  minBlocksForCheckpoint?: number;
  /** Skip publishing checkpoint proposals probability (for testing checkpoint prunes only) */
  skipPublishingCheckpointsPercent?: number;
  /** Skip broadcasting checkpoint and block proposals via gossipsub when proposer (for testing only) */
  skipBroadcastProposals?: boolean;
  /**
   * Skip broadcasting only the CheckpointProposal via gossipsub when proposer; the held last block is still broadcast
   * standalone so peers receive it as a proposed-but-uncheckpointed tip. Used to exercise the orphan-proposed-block
   * prune path (for testing only). Narrower variant of `skipBroadcastProposals`: when only this flag is set the held
   * last block is still broadcast standalone, but when `skipBroadcastProposals` is also set neither the block nor the
   * checkpoint proposal is broadcast.
   */
  skipBroadcastCheckpointProposal?: boolean;
  /** List of slots for which the sequencer will not produce a proposal (for testing only). Attestation paths are unaffected. */
  pauseProposingForSlots?: SlotNumber[];
}

export const SequencerConfigSchema = zodFor<SequencerConfig>()(
  z.object({
    sequencerPollingIntervalMS: z.number().optional(),
    maxTxsPerBlock: z.number().optional(),
    maxTxsPerCheckpoint: z.number().optional(),
    maxBlocksPerCheckpoint: z.number().positive().optional(),
    minValidTxsPerBlock: z.number().optional(),
    minTxsPerBlock: z.number().optional(),
    maxL2BlockGas: z.number().optional(),
    publishTxsWithProposals: z.boolean().optional(),
    maxDABlockGas: z.number().optional(),
    perBlockAllocationMultiplier: z.number().optional(),
    perBlockDAAllocationMultiplier: z.number().optional(),
    redistributeCheckpointBudget: z.boolean().optional(),
    coinbase: schemas.EthAddress.optional(),
    feeRecipient: schemas.AztecAddress.optional(),
    acvmWorkingDirectory: z.string().optional(),
    acvmBinaryPath: z.string().optional(),
    txPublicSetupAllowListExtend: z.array(AllowedElementSchema).optional(),
    governanceProposerPayload: schemas.EthAddress.optional(),
    minBlockDuration: z.number().positive().optional(),
    checkpointProposalPrepareTime: z.number().nonnegative().optional(),
    l1PublishingTime: z.number().optional(),
    fakeProcessingDelayPerTxMs: z.number().optional(),
    fakeThrowAfterProcessingTxCount: z.number().optional(),
    attestationPropagationTime: z.number().optional(),
    skipCollectingAttestations: z.boolean().optional(),
    skipInvalidateBlockAsProposer: z.boolean().optional(),
    skipWaitForValidParentCheckpointOnL1: z.boolean().optional(),
    secondsBeforeInvalidatingBlockAsCommitteeMember: z.number(),
    secondsBeforeInvalidatingBlockAsNonCommitteeMember: z.number(),
    broadcastInvalidBlockProposal: z.boolean().optional(),
    invalidBlockProposalIndexWithinCheckpoint: z.number().int().nonnegative().optional(),
    broadcastInvalidCheckpointProposalOnly: z.boolean().optional(),
    injectFakeAttestation: z.boolean().optional(),
    injectHighSValueAttestation: z.boolean().optional(),
    injectUnrecoverableSignatureAttestation: z.boolean().optional(),
    fishermanMode: z.boolean().optional(),
    shuffleAttestationOrdering: z.boolean().optional(),
    blockDurationMs: z.number().positive().optional(),
    checkpointProposalSyncGraceSeconds: z.number().nonnegative().optional(),
    expectedBlockProposalsPerSlot: z.number().nonnegative().optional(),
    buildCheckpointIfEmpty: z.boolean().optional(),
    waitForBuildDeadlineOnFinalBlock: z.boolean().optional(),
    skipPushProposedBlocksToArchiver: z.boolean().optional(),
    minBlocksForCheckpoint: z.number().positive().optional(),
    skipPublishingCheckpointsPercent: z.number().gte(0).lte(100).optional(),
    skipBroadcastProposals: z.boolean().optional(),
    skipBroadcastCheckpointProposal: z.boolean().optional(),
    pauseProposingForSlots: z.array(SlotNumberSchema).optional(),
  }),
);

type SequencerConfigOptionalKeys =
  | 'governanceProposerPayload'
  | 'expectedBlockProposalsPerSlot'
  | 'coinbase'
  | 'feeRecipient'
  | 'acvmWorkingDirectory'
  | 'acvmBinaryPath'
  | 'fakeProcessingDelayPerTxMs'
  | 'fakeThrowAfterProcessingTxCount'
  | 'minBlockDuration'
  | 'checkpointProposalPrepareTime'
  | 'txPublicSetupAllowListExtend'
  | 'invalidBlockProposalIndexWithinCheckpoint'
  | 'minValidTxsPerBlock'
  | 'minBlocksForCheckpoint'
  | 'maxTxsPerBlock'
  | 'maxTxsPerCheckpoint'
  | 'maxL2BlockGas'
  | 'maxDABlockGas'
  | 'redistributeCheckpointBudget'
  | 'skipBroadcastProposals'
  | 'skipBroadcastCheckpointProposal'
  | 'pauseProposingForSlots';

export type ResolvedSequencerConfig = Prettify<
  Required<Omit<SequencerConfig, SequencerConfigOptionalKeys>> & Pick<SequencerConfig, SequencerConfigOptionalKeys>
>;
