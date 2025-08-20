import { type BlobSinkConfig, blobSinkConfigMapping } from '@aztec/blob-sink/client';
import {
  type L1ReaderConfig,
  type L1TxUtilsConfig,
  NULL_KEY,
  l1ReaderConfigMappings,
  l1TxUtilsConfigMappings,
} from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  type SecretValue,
  getConfigFromMappings,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * The configuration of the rollup transaction publisher.
 */
export type TxSenderConfig = L1ReaderConfig & {
  /**
   * The private key to be used by the publisher.
   */
  publisherPrivateKeys: SecretValue<`0x${string}`>[];

  /**
   * The address of the custom forwarder contract.
   */
  customForwarderContractAddress: EthAddress;
};

/**
 * Configuration of the L1Publisher.
 */
export type PublisherConfig = L1TxUtilsConfig &
  BlobSinkConfig & {
    /**
     * The interval to wait between publish retries.
     */
    l1PublishRetryIntervalMS: number;
  };

export const getTxSenderConfigMappings: (
  scope: 'PROVER' | 'SEQ',
) => ConfigMappingsType<Omit<TxSenderConfig, 'l1Contracts'>> = (scope: 'PROVER' | 'SEQ') => ({
  ...l1ReaderConfigMappings,
  customForwarderContractAddress: {
    env: `CUSTOM_FORWARDER_CONTRACT_ADDRESS`,
    parseEnv: (val: string) => EthAddress.fromString(val),
    description: 'The address of the custom forwarder contract.',
    defaultValue: EthAddress.ZERO,
  },
  publisherPrivateKeys: {
    env: scope === 'PROVER' ? `PROVER_PUBLISHER_PRIVATE_KEYS` : `SEQ_PUBLISHER_PRIVATE_KEYS`,
    description: 'The private keys to be used by the publisher.',
    ...secretValueConfigHelper<`0x${string}`[]>(val =>
      val ? val.split(',').map<`0x${string}`>(key => `0x${key.replace('0x', '')}`) : [],
    ),
    fallback: scope === 'PROVER' ? ['PROVER_PUBLISHER_PRIVATE_KEY'] : ['SEQ_PUBLISHER_PRIVATE_KEY'],
  },
});

export function getTxSenderConfigFromEnv(scope: 'PROVER' | 'SEQ'): Omit<TxSenderConfig, 'l1Contracts'> {
  return getConfigFromMappings(getTxSenderConfigMappings(scope));
}

export const getPublisherConfigMappings: (
  scope: 'PROVER' | 'SEQ',
) => ConfigMappingsType<PublisherConfig & L1TxUtilsConfig> = scope => ({
  l1PublishRetryIntervalMS: {
    env: scope === `PROVER` ? `PROVER_PUBLISH_RETRY_INTERVAL_MS` : `SEQ_PUBLISH_RETRY_INTERVAL_MS`,
    parseEnv: (val: string) => +val,
    defaultValue: 1000,
    description: 'The interval to wait between publish retries.',
  },
  ...l1TxUtilsConfigMappings,
  ...blobSinkConfigMapping,
});

export function getPublisherConfigFromEnv(scope: 'PROVER' | 'SEQ'): PublisherConfig {
  return getConfigFromMappings(getPublisherConfigMappings(scope));
}

export function getPublisherPrivateKeysFromConfig(config: TxSenderConfig) {
  const { publisherPrivateKeys } = config;
  if (publisherPrivateKeys.length === 0) {
    throw new Error('Publisher private keys are required in the configuration.');
  }
  if (publisherPrivateKeys.some(k => k.getValue() === NULL_KEY)) {
    throw new Error('Invalid publisher private keys found in configuration.');
  }
  return publisherPrivateKeys;
}
