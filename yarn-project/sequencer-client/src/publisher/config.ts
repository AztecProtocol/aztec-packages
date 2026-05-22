import { type BlobClientConfig, blobClientConfigMapping } from '@aztec/blob-client/client/config';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from '@aztec/ethereum/l1-tx-utils/config';
import { type ConfigMappingsType, SecretValue, booleanConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { parseEther } from 'viem';

/** Configuration of the transaction publisher. */
export type TxSenderConfig = L1ReaderConfig & {
  /** The private key to be used by the publisher. */
  publisherPrivateKeys?: SecretValue<`0x${string}`>[];

  /** Publisher addresses to be used with a remote signer */
  publisherAddresses?: EthAddress[];
};

export type ProverTxSenderConfig = L1ReaderConfig & {
  proverPublisherPrivateKeys?: SecretValue<`0x${string}`>[];
  proverPublisherAddresses?: EthAddress[];
};

export type SequencerTxSenderConfig = L1ReaderConfig & {
  sequencerPublisherPrivateKeys?: SecretValue<`0x${string}`>[];
  sequencerPublisherAddresses?: EthAddress[];
};

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

/** Configuration of the L1Publisher. */
export type PublisherConfig = L1TxUtilsConfig &
  BlobClientConfig & {
    /** True to use publishers in invalid states (timed out, cancelled, etc) if no other is available */
    publisherAllowInvalidStates?: boolean;
    /** Whether to run in fisherman mode: builds blocks on every slot for validation without publishing to L1 */
    fishermanMode?: boolean;
    /** Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only) */
    publisherForwarderAddress?: EthAddress;
    /** Store for failed L1 transaction inputs (test networks only). Format: gs://bucket/path */
    l1TxFailedStore?: string;
    /** Min ETH balance below which a publisher gets funded. Undefined = funding disabled. */
    publisherFundingThreshold?: bigint;
    /** Amount of ETH to send when funding a publisher. Undefined = funding disabled. */
    publisherFundingAmount?: bigint;
  };

/** Shared config mappings for publisher funding, used by both sequencer and prover publisher configs. */
const publisherFundingConfigMappings = {
  publisherFundingThreshold: {
    env: 'PUBLISHER_FUNDING_THRESHOLD' as const,
    description:
      'Min ETH balance below which a publisher gets funded. Specified in ether (e.g. 0.1). Unset = funding disabled.',
    parseEnv: (val: string) => parseEther(val),
  },
  publisherFundingAmount: {
    env: 'PUBLISHER_FUNDING_AMOUNT' as const,
    description:
      'Amount of ETH to send when funding a publisher. Specified in ether (e.g. 0.5). Unset = funding disabled.',
    parseEnv: (val: string) => parseEther(val),
  },
};

export type ProverPublisherConfig = L1TxUtilsConfig &
  BlobClientConfig & {
    fishermanMode?: boolean;
    proverPublisherAllowInvalidStates?: boolean;
    proverPublisherForwarderAddress?: EthAddress;
    /** Min ETH balance below which a publisher gets funded. Undefined = funding disabled. */
    publisherFundingThreshold?: bigint;
    /** Amount of ETH to send when funding a publisher. Undefined = funding disabled. */
    publisherFundingAmount?: bigint;
  };

export type SequencerPublisherConfig = L1TxUtilsConfig &
  BlobClientConfig & {
    fishermanMode?: boolean;
    sequencerPublisherAllowInvalidStates?: boolean;
    sequencerPublisherForwarderAddress?: EthAddress;
    /** Store for failed L1 transaction inputs (test networks only). Format: gs://bucket/path */
    l1TxFailedStore?: string;
    /** Min ETH balance below which a publisher gets funded. Undefined = funding disabled. */
    publisherFundingThreshold?: bigint;
    /** Amount of ETH to send when funding a publisher. Undefined = funding disabled. */
    publisherFundingAmount?: bigint;
  };

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

export const proverTxSenderConfigMappings: ConfigMappingsType<ProverTxSenderConfig> = {
  ...l1ReaderConfigMappings,
  proverPublisherPrivateKeys: {
    env: `PROVER_PUBLISHER_PRIVATE_KEYS`,
    description: 'The private keys to be used by the prover publisher.',
    parseEnv: (val: string) =>
      val.split(',').map(key => new SecretValue(`0x${key.replace('0x', '')}` as `0x${string}`)),
    defaultValue: [],
    fallback: [`PROVER_PUBLISHER_PRIVATE_KEY`],
  },
  proverPublisherAddresses: {
    env: `PROVER_PUBLISHER_ADDRESSES`,
    description: 'The addresses of the publishers to use with remote signers',
    parseEnv: (val: string) => val.split(',').map(address => EthAddress.fromString(address)),
    defaultValue: [],
  },
};

export const sequencerTxSenderConfigMappings: ConfigMappingsType<SequencerTxSenderConfig> = {
  ...l1ReaderConfigMappings,
  sequencerPublisherPrivateKeys: {
    env: `SEQ_PUBLISHER_PRIVATE_KEYS`,
    description: 'The private keys to be used by the sequencer publisher.',
    parseEnv: (val: string) =>
      val.split(',').map(key => new SecretValue(`0x${key.replace('0x', '')}` as `0x${string}`)),
    defaultValue: [],
    fallback: [`SEQ_PUBLISHER_PRIVATE_KEY`],
  },
  sequencerPublisherAddresses: {
    env: `SEQ_PUBLISHER_ADDRESSES`,
    description: 'The addresses of the publishers to use with remote signers',
    parseEnv: (val: string) => val.split(',').map(address => EthAddress.fromString(address)),
    defaultValue: [],
  },
};

export const sequencerPublisherConfigMappings: ConfigMappingsType<SequencerPublisherConfig & L1TxUtilsConfig> = {
  ...l1TxUtilsConfigMappings,
  ...blobClientConfigMapping,
  sequencerPublisherAllowInvalidStates: {
    env: `SEQ_PUBLISHER_ALLOW_INVALID_STATES`,
    description: 'True to use publishers in invalid states (timed out, cancelled, etc) if no other is available',
    ...booleanConfigHelper(true),
  },
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: builds blocks on every slot for validation without publishing to L1',
    ...booleanConfigHelper(false),
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
  ...publisherFundingConfigMappings,
};

export const proverPublisherConfigMappings: ConfigMappingsType<ProverPublisherConfig & L1TxUtilsConfig> = {
  ...l1TxUtilsConfigMappings,
  ...blobClientConfigMapping,
  proverPublisherAllowInvalidStates: {
    env: `PROVER_PUBLISHER_ALLOW_INVALID_STATES`,
    description: 'True to use publishers in invalid states (timed out, cancelled, etc) if no other is available',
    ...booleanConfigHelper(true),
  },
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: builds blocks on every slot for validation without publishing to L1',
    ...booleanConfigHelper(false),
  },
  proverPublisherForwarderAddress: {
    env: `PROVER_PUBLISHER_FORWARDER_ADDRESS`,
    description: 'Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only)',
    parseEnv: (val: string) => EthAddress.fromString(val),
  },
  ...publisherFundingConfigMappings,
};
