import { type L1ReaderConfig, type L1TxUtilsConfig, NULL_KEY, l1TxUtilsConfigMappings } from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';

/**
 * The configuration of the rollup transaction publisher.
 */
export type TxSenderConfig = L1ReaderConfig & {
  /**
   * The private key to be used by the publisher.
   */
  publisherPrivateKey: `0x${string}`;

  /**
   * The number of confirmations required.
   */
  requiredConfirmations: number;
};

/**
 * Configuration of the L1Publisher.
 */
export type PublisherConfig = L1TxUtilsConfig & {
  /**
   * The interval to wait between publish retries.
   */
  l1PublishRetryIntervalMS: number;

  /**
   * The URL of the blob sink.
   */
  blobSinkUrl?: string;
};

export const getTxSenderConfigMappings: (
  scope: 'PROVER' | 'SEQ',
) => ConfigMappingsType<Omit<TxSenderConfig, 'l1Contracts'>> = (scope: 'PROVER' | 'SEQ') => ({
  l1RpcUrl: {
    env: 'ETHEREUM_HOST',
    description: 'The RPC Url of the ethereum host.',
  },
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    parseEnv: (val: string) => +val,
    defaultValue: 31337,
    description: 'The chain ID of the ethereum host.',
  },
  publisherPrivateKey: {
    env: `${scope}_PUBLISHER_PRIVATE_KEY`,
    description: 'The private key to be used by the publisher.',
    parseEnv: (val: string) => (val ? `0x${val.replace('0x', '')}` : NULL_KEY),
    defaultValue: NULL_KEY,
  },
  requiredConfirmations: {
    env: `${scope}_REQUIRED_CONFIRMATIONS`,
    parseEnv: (val: string) => +val,
    defaultValue: 1,
    description: 'The number of confirmations required.',
  },
  viemPollingIntervalMS: {
    env: `${scope}_VIEM_POLLING_INTERVAL_MS`,
    description: 'The polling interval viem uses in ms',
    ...numberConfigHelper(1_000),
  },
});

export function getTxSenderConfigFromEnv(scope: 'PROVER' | 'SEQ'): Omit<TxSenderConfig, 'l1Contracts'> {
  return getConfigFromMappings(getTxSenderConfigMappings(scope));
}

export const getPublisherConfigMappings: (
  scope: 'PROVER' | 'SEQ',
) => ConfigMappingsType<PublisherConfig & L1TxUtilsConfig> = scope => ({
  l1PublishRetryIntervalMS: {
    env: `${scope}_PUBLISH_RETRY_INTERVAL_MS`,
    parseEnv: (val: string) => +val,
    defaultValue: 1000,
    description: 'The interval to wait between publish retries.',
  },
  ...l1TxUtilsConfigMappings,
  blobSinkUrl: {
    env: `${scope}_BLOB_SINK_URL`,
    description: 'The URL of the blob sink.',
    parseEnv: (val?: string) => val,
  },
});

export function getPublisherConfigFromEnv(scope: 'PROVER' | 'SEQ'): PublisherConfig {
  return getConfigFromMappings(getPublisherConfigMappings(scope));
}
