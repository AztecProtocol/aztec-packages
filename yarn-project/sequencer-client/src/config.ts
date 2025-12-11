import { type L1ContractsConfig, l1ContractsConfigMappings } from '@aztec/ethereum/config';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  pickConfigMappings,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type KeyStoreConfig, keyStoreConfigMappings } from '@aztec/node-keystore/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ChainConfig, type SequencerConfig, chainConfigMappings } from '@aztec/stdlib/config';
import type { ResolvedSequencerConfig } from '@aztec/stdlib/interfaces/server';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client/config';

import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigMappings,
  getTxSenderConfigMappings,
} from './publisher/config.js';

export * from './publisher/config.js';
export type { SequencerConfig };

export const DEFAULT_ATTESTATION_PROPAGATION_TIME = 2;

/**
 * Default values for SequencerConfig.
 * Centralized location for all sequencer configuration defaults.
 */
export const DefaultSequencerConfig: ResolvedSequencerConfig = {
  sequencerPollingIntervalMS: 500,
  maxTxsPerBlock: 32,
  minTxsPerBlock: 1,
  buildCheckpointIfEmpty: false,
  publishTxsWithProposals: false,
  maxL2BlockGas: 10e9,
  maxDABlockGas: 10e9,
  maxBlockSizeInBytes: 1024 * 1024,
  enforceTimeTable: true,
  attestationPropagationTime: DEFAULT_ATTESTATION_PROPAGATION_TIME,
  secondsBeforeInvalidatingBlockAsCommitteeMember: 144, // 12 L1 blocks
  secondsBeforeInvalidatingBlockAsNonCommitteeMember: 432, // 36 L1 blocks
  skipCollectingAttestations: false,
  skipInvalidateBlockAsProposer: false,
  broadcastInvalidBlockProposal: false,
  injectFakeAttestation: false,
  fishermanMode: false,
  shuffleAttestationOrdering: false,
};

/**
 * Configuration settings for the SequencerClient.
 */
export type SequencerClientConfig = PublisherConfig &
  KeyStoreConfig &
  ValidatorClientConfig &
  TxSenderConfig &
  SequencerConfig &
  L1ReaderConfig &
  ChainConfig &
  Pick<P2PConfig, 'txPublicSetupAllowList'> &
  Pick<L1ContractsConfig, 'ethereumSlotDuration' | 'aztecSlotDuration' | 'aztecEpochDuration'>;

export const sequencerConfigMappings: ConfigMappingsType<SequencerConfig> = {
  sequencerPollingIntervalMS: {
    env: 'SEQ_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polling for checking to build on the next slot.',
    ...numberConfigHelper(DefaultSequencerConfig.sequencerPollingIntervalMS),
  },
  maxTxsPerBlock: {
    env: 'SEQ_MAX_TX_PER_BLOCK',
    description: 'The maximum number of txs to include in a block.',
    ...numberConfigHelper(DefaultSequencerConfig.maxTxsPerBlock),
  },
  minTxsPerBlock: {
    env: 'SEQ_MIN_TX_PER_BLOCK',
    description: 'The minimum number of txs to include in a block.',
    ...numberConfigHelper(DefaultSequencerConfig.minTxsPerBlock),
  },
  publishTxsWithProposals: {
    env: 'SEQ_PUBLISH_TXS_WITH_PROPOSALS',
    description: 'Whether to publish txs with proposals.',
    ...booleanConfigHelper(DefaultSequencerConfig.publishTxsWithProposals),
  },
  maxL2BlockGas: {
    env: 'SEQ_MAX_L2_BLOCK_GAS',
    description: 'The maximum L2 block gas.',
    ...numberConfigHelper(DefaultSequencerConfig.maxL2BlockGas),
  },
  maxDABlockGas: {
    env: 'SEQ_MAX_DA_BLOCK_GAS',
    description: 'The maximum DA block gas.',
    ...numberConfigHelper(DefaultSequencerConfig.maxDABlockGas),
  },
  coinbase: {
    env: 'COINBASE',
    parseEnv: (val: string) => (val ? EthAddress.fromString(val) : undefined),
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
  maxBlockSizeInBytes: {
    env: 'SEQ_MAX_BLOCK_SIZE_IN_BYTES',
    description: 'Max block size',
    ...numberConfigHelper(DefaultSequencerConfig.maxBlockSizeInBytes),
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
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
  attestationPropagationTime: {
    env: 'SEQ_ATTESTATION_PROPAGATION_TIME',
    description: 'How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way)',
    ...numberConfigHelper(DefaultSequencerConfig.attestationPropagationTime),
  },
  fakeProcessingDelayPerTxMs: {
    description: 'Used for testing to introduce a fake delay after processing each tx',
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
  broadcastInvalidBlockProposal: {
    description: 'Broadcast invalid block proposals with corrupted state (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.broadcastInvalidBlockProposal),
  },
  injectFakeAttestation: {
    description: 'Inject a fake attestation (for testing only)',
    ...booleanConfigHelper(DefaultSequencerConfig.injectFakeAttestation),
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
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description:
      'Duration per block in milliseconds when building multiple blocks per slot. ' +
      'If undefined (default), builds a single block per slot using the full slot duration.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
  buildCheckpointIfEmpty: {
    env: 'SEQ_BUILD_CHECKPOINT_IF_EMPTY',
    description: 'Have sequencer build and publish an empty checkpoint if there are no txs',
    ...booleanConfigHelper(DefaultSequencerConfig.buildCheckpointIfEmpty),
  },
  ...pickConfigMappings(p2pConfigMappings, ['txPublicSetupAllowList']),
};

export const sequencerClientConfigMappings: ConfigMappingsType<SequencerClientConfig> = {
  ...validatorClientConfigMappings,
  ...sequencerConfigMappings,
  ...keyStoreConfigMappings,
  ...l1ReaderConfigMappings,
  ...getTxSenderConfigMappings('SEQ'),
  ...getPublisherConfigMappings('SEQ'),
  ...chainConfigMappings,
  ...pickConfigMappings(l1ContractsConfigMappings, ['ethereumSlotDuration', 'aztecSlotDuration', 'aztecEpochDuration']),
};

/**
 * Creates an instance of SequencerClientConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getConfigEnvVars(): SequencerClientConfig {
  return getConfigFromMappings<SequencerClientConfig>(sequencerClientConfigMappings);
}
