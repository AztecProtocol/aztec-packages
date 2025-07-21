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
  publisherPrivateKey: SecretValue<`0x${string}`>;

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
  publisherPrivateKey: {
    env: scope === 'PROVER' ? `PROVER_PUBLISHER_PRIVATE_KEY` : `SEQ_PUBLISHER_PRIVATE_KEY`,
    description: 'The private key to be used by the publisher.',
    ...secretValueConfigHelper(val => (val ? `0x${val.replace('0x', '')}` : NULL_KEY)),
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
