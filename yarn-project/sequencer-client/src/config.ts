import { type L1ContractsConfig, l1ContractsConfigMappings } from '@aztec/ethereum/config';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
  pickConfigMappings,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type KeyStoreConfig, keyStoreConfigMappings } from '@aztec/node-keystore/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ChainConfig,
  DEFAULT_MAX_BLOCKS_PER_CHECKPOINT,
  type PipelineConfig,
  type SequencerConfig,
  chainConfigMappings,
  pipelineConfigMappings,
  sharedSequencerConfigMappings,
} from '@aztec/stdlib/config';
import type { ResolvedSequencerConfig } from '@aztec/stdlib/interfaces/server';
import { DEFAULT_P2P_PROPAGATION_TIME } from '@aztec/stdlib/timetable';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client/config';

import {
  type SequencerPublisherConfig,
  type SequencerTxSenderConfig,
  sequencerPublisherConfigMappings,
  sequencerTxSenderConfigMappings,
} from './publisher/config.js';

export * from './publisher/config.js';
export type { SequencerConfig };

/**
 * Default values for SequencerConfig.
 * Centralized location for all sequencer configuration defaults.
 */
export const DefaultSequencerConfig = {
  sequencerPollingIntervalMS: 500,
  minTxsPerBlock: 1,
  buildCheckpointIfEmpty: false,
  publishTxsWithProposals: false,
  perBlockAllocationMultiplier: 1.2,
  redistributeCheckpointBudget: true,
  enforceTimeTable: true,
  attestationPropagationTime: DEFAULT_P2P_PROPAGATION_TIME,
  secondsBeforeInvalidatingBlockAsCommitteeMember: 144, // 12 L1 blocks
  secondsBeforeInvalidatingBlockAsNonCommitteeMember: 432, // 36 L1 blocks
  skipCollectingAttestations: false,
  skipInvalidateBlockAsProposer: false,
  skipWaitForValidParentCheckpointOnL1: false,
  broadcastInvalidBlockProposal: false,
  broadcastInvalidCheckpointProposalOnly: false,
  injectFakeAttestation: false,
  injectHighSValueAttestation: false,
  injectUnrecoverableSignatureAttestation: false,
  fishermanMode: false,
  shuffleAttestationOrdering: false,
  skipPushProposedBlocksToArchiver: false,
  skipPublishingCheckpointsPercent: 0,
  maxBlocksPerCheckpoint: DEFAULT_MAX_BLOCKS_PER_CHECKPOINT,
} satisfies ResolvedSequencerConfig;

/**
 * Configuration settings for the SequencerClient.
 */
export type SequencerClientConfig = SequencerPublisherConfig &
  KeyStoreConfig &
  ValidatorClientConfig &
  SequencerTxSenderConfig &
  SequencerConfig &
  L1ReaderConfig &
  ChainConfig &
  PipelineConfig &
  Pick<P2PConfig, 'txPublicSetupAllowListExtend'> &
  Pick<L1ContractsConfig, 'ethereumSlotDuration' | 'aztecSlotDuration' | 'aztecEpochDuration'>;

export const sequencerConfigMappings: ConfigMappingsType<SequencerConfig> = {
  sequencerPollingIntervalMS: {
    env: 'SEQ_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polling for checking to build on the next slot.',
    ...numberConfigHelper(DefaultSequencerConfig.sequencerPollingIntervalMS),
  },
  maxTxsPerCheckpoint: {
    env: 'SEQ_MAX_TX_PER_CHECKPOINT',
    description: 'The maximum number of txs across all blocks in a checkpoint.',
    ...optionalNumberConfigHelper(),
  },
  minTxsPerBlock: {
    env: 'SEQ_MIN_TX_PER_BLOCK',
    description: 'The minimum number of txs to include in a block.',
    ...numberConfigHelper(DefaultSequencerConfig.minTxsPerBlock),
  },
  minValidTxsPerBlock: {
    description:
      'The minimum number of valid txs (after execution) to include in a block. If not set, falls back to minTxsPerBlock.',
  },
  publishTxsWithProposals: {
    env: 'SEQ_PUBLISH_TXS_WITH_PROPOSALS',
    description: 'Whether to publish txs with proposals.',
    ...booleanConfigHelper(DefaultSequencerConfig.publishTxsWithProposals),
  },
  maxL2BlockGas: {
    env: 'SEQ_MAX_L2_BLOCK_GAS',
    description: 'The maximum L2 block gas.',
    ...optionalNumberConfigHelper(),
  },
  maxDABlockGas: {
    env: 'SEQ_MAX_DA_BLOCK_GAS',
    description: 'The maximum DA block gas.',
    ...optionalNumberConfigHelper(),
  },
  perBlockAllocationMultiplier: {
    env: 'SEQ_PER_BLOCK_ALLOCATION_MULTIPLIER',
    description:
      'Per-block gas budget multiplier for both L2 and DA gas. Budget per block is (checkpointLimit / maxBlocks) * multiplier.' +
      ' Values greater than one allow early blocks to use more than their even share, relying on checkpoint-level capping for later blocks.',
    ...numberConfigHelper(DefaultSequencerConfig.perBlockAllocationMultiplier),
  },
  redistributeCheckpointBudget: {
    env: 'SEQ_REDISTRIBUTE_CHECKPOINT_BUDGET',
    description:
      'Redistribute remaining checkpoint budget evenly across remaining blocks instead of allowing a single block to consume the entire remaining budget.',
    ...booleanConfigHelper(DefaultSequencerConfig.redistributeCheckpointBudget),
  },
  coinbase: {
    env: 'COINBASE',
    parseEnv: (val: string) => EthAddress.fromString(val),
    description: 'Recipient of block reward.',
  },
  feeRecipient: {
    env: 'FEE_RECIPIENT',
    parseEnv: (val: string) => AztecAddress.fromString(val),
    description: 'Address to receive fees.',
  },
  acvmWorkingDirectory: {
    env: 'ACVM_WORKING_DIRECTORY',
    description: 'The working directory to use for simulation/proving',
  },
  acvmBinaryPath: {
    env: 'ACVM_BINARY_PATH',
    description: 'The path to the ACVM binary',
  },
  enforceTimeTable: {
    env: 'SEQ_ENFORCE_TIME_TABLE',
    description: 'Whether to enforce the time table when building blocks',
    ...booleanConfigHelper(DefaultSequencerConfig.enforceTimeTable),
  },
  governanceProposerPayload: {
    env: 'GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS',
    description: 'The address of the payload for the governanceProposer',
    parseEnv: (val: string) => EthAddress.fromString(val),
  },
  l1PublishingTime: {
    env: 'SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT',
    description: 'How much time (in seconds) we allow in the slot for publishing the L1 tx (defaults to 1 L1 slot).',
    ...optionalNumberConfigHelper(),
  },
  fakeProcessingDelayPerTxMs: {
    description: 'Used for testing to introduce a fake delay after processing each tx',
  },
  fakeThrowAfterProcessingTxCount: {
    description: 'Used for testing to throw an error after processing N txs',
  },
  secondsBeforeInvalidatingBlockAsCommitteeMember: {
    env: 'SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_COMMITTEE_MEMBER',
    description:
      'How many seconds to wait before trying to invalidate a block from the pending chain as a committee member (zero to never invalidate).' +
      ' The next proposer is expected to invalidate, so the committee acts as a fallback.',
    ...numberConfigHelper(DefaultSequencerConfig.secondsBeforeInvalidatingBlockAsCommitteeMember),
  },
  secondsBeforeInvalidatingBlockAsNonCommitteeMember: {
    env: 'SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_NON_COMMITTEE_MEMBER',
    description:
      'How many seconds to wait before trying to invalidate a block from the pending chain as a non-committee member (zero to never invalidate).' +
      ' The next proposer is expected to invalidate, then the committee, so other sequencers act as a fallback.',
    ...numberConfigHelper(DefaultSequencerConfig.secondsBeforeInvalidatingBlockAsNonCommitteeMember),
  },
  skipCollectingAttestations: {
    description:
      'Whether to skip collecting attestations from validators and only use self-attestations (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.skipCollectingAttestations),
  },
  skipInvalidateBlockAsProposer: {
    description: 'Do not invalidate the previous block if invalid when we are the proposer (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.skipInvalidateBlockAsProposer),
  },
  skipWaitForValidParentCheckpointOnL1: {
    description:
      'Bypass the parent checkpoint validity check before submitting a pipelined checkpoint, ' +
      'allowing the proposer to publish even when the parent landed on L1 with invalid attestations (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.skipWaitForValidParentCheckpointOnL1),
  },
  broadcastInvalidBlockProposal: {
    description: 'Broadcast invalid block proposals with corrupted state (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.broadcastInvalidBlockProposal),
  },
  invalidBlockProposalIndexWithinCheckpoint: {
    description: 'Broadcast an invalid block proposal only at this indexWithinCheckpoint (for testing only)',
    ...optionalNumberConfigHelper(),
  },
  broadcastInvalidCheckpointProposalOnly: {
    description:
      'Broadcast invalid checkpoint proposals while keeping the underlying block proposals valid (for testing only). When unset, the checkpoint follows broadcastInvalidBlockProposal.',
    ...booleanConfigHelper(DefaultSequencerConfig.broadcastInvalidCheckpointProposalOnly),
  },
  injectFakeAttestation: {
    description: 'Inject a fake attestation (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.injectFakeAttestation),
  },
  injectHighSValueAttestation: {
    description: 'Inject a malleable attestation with a high-s value (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.injectHighSValueAttestation),
  },
  injectUnrecoverableSignatureAttestation: {
    description: 'Inject an attestation with an unrecoverable signature (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.injectUnrecoverableSignatureAttestation),
  },
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: builds blocks on every slot for validation without publishing to L1',
    ...booleanConfigHelper(DefaultSequencerConfig.fishermanMode),
  },
  shuffleAttestationOrdering: {
    description: 'Shuffle attestation ordering to create invalid ordering (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.shuffleAttestationOrdering),
  },
  ...sharedSequencerConfigMappings,
  buildCheckpointIfEmpty: {
    env: 'SEQ_BUILD_CHECKPOINT_IF_EMPTY',
    description: 'Have sequencer build and publish an empty checkpoint if there are no txs',
    ...booleanConfigHelper(DefaultSequencerConfig.buildCheckpointIfEmpty),
  },
  skipPushProposedBlocksToArchiver: {
    description: 'Skip pushing proposed blocks to archiver (default: true)',
    ...booleanConfigHelper(DefaultSequencerConfig.skipPushProposedBlocksToArchiver),
  },
  minBlocksForCheckpoint: {
    description: 'Minimum number of blocks required for a checkpoint proposal (test only)',
  },
  skipPublishingCheckpointsPercent: {
    env: 'SEQ_SKIP_CHECKPOINT_PUBLISH_PERCENT',
    description: 'Percent probability (0 - 100) of sequencer skipping checkpoint publishing (testing only)',
    ...numberConfigHelper(DefaultSequencerConfig.skipPublishingCheckpointsPercent),
  },
  skipBroadcastProposals: {
    description: 'Skip broadcasting checkpoint and block proposals via gossipsub when proposer (for testing only)',
    ...booleanConfigHelper(false),
  },
  skipBroadcastCheckpointProposal: {
    description:
      'Skip broadcasting only the CheckpointProposal via gossipsub when proposer; the held last block is broadcast ' +
      'standalone instead so peers still receive it as a proposed-but-uncheckpointed tip (for testing only)',
    ...booleanConfigHelper(false),
  },
  pauseProposingForSlots: {
    description:
      'List of slots for which the sequencer will not produce a proposal (for testing only). Attestation paths are unaffected.',
  },
  ...pickConfigMappings(p2pConfigMappings, ['txPublicSetupAllowListExtend']),
};

export const sequencerClientConfigMappings: ConfigMappingsType<SequencerClientConfig> = {
  ...chainConfigMappings,
  ...validatorClientConfigMappings,
  ...sequencerConfigMappings,
  ...keyStoreConfigMappings,
  ...l1ReaderConfigMappings,
  ...sequencerTxSenderConfigMappings,
  ...sequencerPublisherConfigMappings,
  ...pipelineConfigMappings,
  ...pickConfigMappings(l1ContractsConfigMappings, ['ethereumSlotDuration', 'aztecSlotDuration', 'aztecEpochDuration']),
};

/**
 * Creates an instance of SequencerClientConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getConfigEnvVars(): SequencerClientConfig {
  return getConfigFromMappings<SequencerClientConfig>(sequencerClientConfigMappings);
}
