import { type BlobClientConfig, blobClientConfigMapping } from '@aztec/blob-client/client/config';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from '@aztec/ethereum/l1-tx-utils/config';
import {
  type ConfigMappingsType,
  SecretValue,
  booleanConfigHelper,
  composeConfigMappings,
  parseCommaSeparated,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type FishermanModeConfig, fishermanModeConfigMappings } from '@aztec/stdlib/config';

import { parseEther } from 'viem';

type OwnTxSenderConfig = {
  /** The private key to be used by the publisher. */
  publisherPrivateKeys?: SecretValue<`0x${string}`>[];
  /** Publisher addresses to be used with a remote signer */
  publisherAddresses?: EthAddress[];
};

type OwnProverTxSenderConfig = {
  proverPublisherPrivateKeys?: SecretValue<`0x${string}`>[];
  proverPublisherAddresses?: EthAddress[];
};

type OwnSequencerTxSenderConfig = {
  sequencerPublisherPrivateKeys?: SecretValue<`0x${string}`>[];
  sequencerPublisherAddresses?: EthAddress[];
};

export type TxSenderConfig = OwnTxSenderConfig & L1ReaderConfig;

export type ProverTxSenderConfig = OwnProverTxSenderConfig & L1ReaderConfig;

export type SequencerTxSenderConfig = OwnSequencerTxSenderConfig & L1ReaderConfig;

export function getTxSenderConfigFromProverConfig(config: ProverTxSenderConfig): TxSenderConfig {
  return {
    ...config,
    publisherPrivateKeys: config.proverPublisherPrivateKeys,
    publisherAddresses: config.proverPublisherAddresses,
  };
}

export function getTxSenderConfigFromSequencerConfig(config: SequencerTxSenderConfig): TxSenderConfig {
  return {
    ...config,
    publisherPrivateKeys: config.sequencerPublisherPrivateKeys,
    publisherAddresses: config.sequencerPublisherAddresses,
  };
}

const ownProverTxSenderConfigMappings: ConfigMappingsType<OwnProverTxSenderConfig> = {
  proverPublisherPrivateKeys: {
    env: `PROVER_PUBLISHER_PRIVATE_KEYS`,
    description: 'The private keys to be used by the prover publisher.',
    parseEnv: (val: string) =>
      parseCommaSeparated(val).map(key => new SecretValue(`0x${key.replace('0x', '')}` as `0x${string}`)),
    defaultValue: [],
    fallback: [`PROVER_PUBLISHER_PRIVATE_KEY`],
  },
  proverPublisherAddresses: {
    env: `PROVER_PUBLISHER_ADDRESSES`,
    description: 'The addresses of the publishers to use with remote signers',
    parseEnv: (val: string) => parseCommaSeparated(val).map(address => EthAddress.fromString(address)),
    defaultValue: [],
  },
};

const ownSequencerTxSenderConfigMappings: ConfigMappingsType<OwnSequencerTxSenderConfig> = {
  sequencerPublisherPrivateKeys: {
    env: `SEQ_PUBLISHER_PRIVATE_KEYS`,
    description: 'The private keys to be used by the sequencer publisher.',
    parseEnv: (val: string) =>
      parseCommaSeparated(val).map(key => new SecretValue(`0x${key.replace('0x', '')}` as `0x${string}`)),
    defaultValue: [],
    fallback: [`SEQ_PUBLISHER_PRIVATE_KEY`],
  },
  sequencerPublisherAddresses: {
    env: `SEQ_PUBLISHER_ADDRESSES`,
    description: 'The addresses of the publishers to use with remote signers',
    parseEnv: (val: string) => parseCommaSeparated(val).map(address => EthAddress.fromString(address)),
    defaultValue: [],
  },
};

export const proverTxSenderConfigMappings: ConfigMappingsType<ProverTxSenderConfig> = composeConfigMappings(
  ownProverTxSenderConfigMappings,
  l1ReaderConfigMappings,
);

export const sequencerTxSenderConfigMappings: ConfigMappingsType<SequencerTxSenderConfig> = composeConfigMappings(
  ownSequencerTxSenderConfigMappings,
  l1ReaderConfigMappings,
);

/** Publisher funding fields shared between the sequencer and prover publisher configs. */
type OwnPublisherFundingConfig = {
  /** Min ETH balance below which a publisher gets funded. Undefined = funding disabled. */
  publisherFundingThreshold?: bigint;
  /** Amount of ETH to send when funding a publisher. Undefined = funding disabled. */
  publisherFundingAmount?: bigint;
};

type OwnPublisherConfig = {
  /** True to use publishers in invalid states (timed out, cancelled, etc) if no other is available */
  publisherAllowInvalidStates?: boolean;
  /** Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only) */
  publisherForwarderAddress?: EthAddress;
  /** Store for failed L1 transaction inputs (test networks only). Format: gs://bucket/path */
  l1TxFailedStore?: string;
};

type OwnProverPublisherConfig = {
  proverPublisherAllowInvalidStates?: boolean;
  proverPublisherForwarderAddress?: EthAddress;
};

type OwnSequencerPublisherConfig = {
  sequencerPublisherAllowInvalidStates?: boolean;
  sequencerPublisherForwarderAddress?: EthAddress;
  /** Store for failed L1 transaction inputs (test networks only). Format: gs://bucket/path */
  l1TxFailedStore?: string;
};

/** Configuration of the L1Publisher. */
export type PublisherConfig = OwnPublisherConfig &
  OwnPublisherFundingConfig &
  L1TxUtilsConfig &
  BlobClientConfig &
  FishermanModeConfig;

export type ProverPublisherConfig = OwnProverPublisherConfig &
  OwnPublisherFundingConfig &
  L1TxUtilsConfig &
  BlobClientConfig &
  FishermanModeConfig;

export type SequencerPublisherConfig = OwnSequencerPublisherConfig &
  OwnPublisherFundingConfig &
  L1TxUtilsConfig &
  BlobClientConfig &
  FishermanModeConfig;

export function getPublisherConfigFromProverConfig(config: ProverPublisherConfig): PublisherConfig {
  return {
    ...config,
    publisherAllowInvalidStates: config.proverPublisherAllowInvalidStates,
    publisherForwarderAddress: config.proverPublisherForwarderAddress,
  };
}

export function getPublisherConfigFromSequencerConfig(config: SequencerPublisherConfig): PublisherConfig {
  return {
    ...config,
    publisherAllowInvalidStates: config.sequencerPublisherAllowInvalidStates,
    publisherForwarderAddress: config.sequencerPublisherForwarderAddress,
    l1TxFailedStore: config.l1TxFailedStore,
  };
}

const ownPublisherFundingConfigMappings: ConfigMappingsType<OwnPublisherFundingConfig> = {
  publisherFundingThreshold: {
    env: 'PUBLISHER_FUNDING_THRESHOLD',
    description:
      'Min ETH balance below which a publisher gets funded. Specified in ether (e.g. 0.1). Unset = funding disabled.',
    parseEnv: (val: string) => parseEther(val),
  },
  publisherFundingAmount: {
    env: 'PUBLISHER_FUNDING_AMOUNT',
    description:
      'Amount of ETH to send when funding a publisher. Specified in ether (e.g. 0.5). Unset = funding disabled.',
    parseEnv: (val: string) => parseEther(val),
  },
};

const ownProverPublisherConfigMappings: ConfigMappingsType<OwnProverPublisherConfig> = {
  proverPublisherAllowInvalidStates: {
    env: `PROVER_PUBLISHER_ALLOW_INVALID_STATES`,
    description: 'True to use publishers in invalid states (timed out, cancelled, etc) if no other is available',
    ...booleanConfigHelper(true),
  },
  proverPublisherForwarderAddress: {
    env: `PROVER_PUBLISHER_FORWARDER_ADDRESS`,
    description: 'Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only)',
    parseEnv: (val: string) => EthAddress.fromString(val),
  },
};

const ownSequencerPublisherConfigMappings: ConfigMappingsType<OwnSequencerPublisherConfig> = {
  sequencerPublisherAllowInvalidStates: {
    env: `SEQ_PUBLISHER_ALLOW_INVALID_STATES`,
    description: 'True to use publishers in invalid states (timed out, cancelled, etc) if no other is available',
    ...booleanConfigHelper(true),
  },
  sequencerPublisherForwarderAddress: {
    env: `SEQ_PUBLISHER_FORWARDER_ADDRESS`,
    description: 'Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only)',
    parseEnv: (val: string) => EthAddress.fromString(val),
  },
  l1TxFailedStore: {
    env: 'L1_TX_FAILED_STORE',
    description: 'Store for failed L1 transaction inputs (test networks only). Format: gs://bucket/path',
  },
};

export const proverPublisherConfigMappings: ConfigMappingsType<ProverPublisherConfig> = composeConfigMappings(
  ownProverPublisherConfigMappings,
  ownPublisherFundingConfigMappings,
  l1TxUtilsConfigMappings,
  blobClientConfigMapping,
  fishermanModeConfigMappings,
);

export const sequencerPublisherConfigMappings: ConfigMappingsType<SequencerPublisherConfig> = composeConfigMappings(
  ownSequencerPublisherConfigMappings,
  ownPublisherFundingConfigMappings,
  l1TxUtilsConfigMappings,
  blobClientConfigMapping,
  fishermanModeConfigMappings,
);
