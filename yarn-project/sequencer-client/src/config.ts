import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  l1ContractsConfigMappings,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  pickConfigMappings,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ChainConfig, type SequencerConfig, chainConfigMappings } from '@aztec/stdlib/config';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client';

import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigMappings,
  getTxSenderConfigMappings,
} from './publisher/config.js';

export * from './publisher/config.js';
export type { SequencerConfig };

/**
 * Configuration settings for the SequencerClient.
 */
export type SequencerClientConfig = PublisherConfig &
  ValidatorClientConfig &
  TxSenderConfig &
  SequencerConfig &
  L1ReaderConfig &
  ChainConfig &
  Pick<P2PConfig, 'txPublicSetupAllowList'> &
  Pick<L1ContractsConfig, 'ethereumSlotDuration' | 'aztecSlotDuration' | 'aztecEpochDuration'>;

export const sequencerConfigMappings: ConfigMappingsType<SequencerConfig> = {
  transactionPollingIntervalMS: {
    env: 'SEQ_TX_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polling for pending txs.',
    ...numberConfigHelper(500),
  },
  maxTxsPerBlock: {
    env: 'SEQ_MAX_TX_PER_BLOCK',
    description: 'The maximum number of txs to include in a block.',
    ...numberConfigHelper(32),
  },
  minTxsPerBlock: {
    env: 'SEQ_MIN_TX_PER_BLOCK',
    description: 'The minimum number of txs to include in a block.',
    ...numberConfigHelper(1),
  },
  publishTxsWithProposals: {
    env: 'SEQ_PUBLISH_TXS_WITH_PROPOSALS',
    description: 'Whether to publish txs with proposals.',
    ...booleanConfigHelper(false),
  },
  maxL2BlockGas: {
    env: 'SEQ_MAX_L2_BLOCK_GAS',
    description: 'The maximum L2 block gas.',
    ...numberConfigHelper(10e9),
  },
  maxDABlockGas: {
    env: 'SEQ_MAX_DA_BLOCK_GAS',
    description: 'The maximum DA block gas.',
    ...numberConfigHelper(10e9),
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
    ...numberConfigHelper(1024 * 1024),
  },
  enforceTimeTable: {
    env: 'SEQ_ENFORCE_TIME_TABLE',
    description: 'Whether to enforce the time table when building blocks',
    ...booleanConfigHelper(),
    defaultValue: true,
  },
  governanceProposerPayload: {
    env: 'GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS',
    description: 'The address of the payload for the governanceProposer',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: EthAddress.ZERO,
  },
  maxL1TxInclusionTimeIntoSlot: {
    env: 'SEQ_MAX_L1_TX_INCLUSION_TIME_INTO_SLOT',
    description: 'How many seconds into an L1 slot we can still send a tx and get it mined.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
  ...pickConfigMappings(p2pConfigMappings, ['txPublicSetupAllowList']),
};

export const sequencerClientConfigMappings: ConfigMappingsType<SequencerClientConfig> = {
  ...validatorClientConfigMappings,
  ...sequencerConfigMappings,
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
