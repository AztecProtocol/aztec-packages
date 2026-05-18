import {
  type ConfigMappingsType,
  composeConfigMappings,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
  parseCommaSeparated,
} from '@aztec/foundation/config';

import { type L1ContractAddresses, l1ContractAddressesMapping } from './l1_contract_addresses.js';

export type L1ChainIdConfig = {
  /** The chain ID of the ethereum host. */
  l1ChainId: number;
};

export const l1ChainIdConfigMappings: ConfigMappingsType<L1ChainIdConfig> = {
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    ...numberConfigHelper(31337),
    description: 'The chain ID of the ethereum host.',
  },
};

export type L1RpcUrlsConfig = {
  /** List of URLs of Ethereum RPC nodes that services will connect to (comma separated). */
  l1RpcUrls: string[];
};

export const l1RpcUrlsConfigMappings: ConfigMappingsType<L1RpcUrlsConfig> = {
  l1RpcUrls: {
    env: 'ETHEREUM_HOSTS',
    description: 'List of URLs of Ethereum RPC nodes that services will connect to (comma separated).',
    parseEnv: parseCommaSeparated,
    defaultValue: [],
  },
};

/** Configuration of the L1GlobalReader. */
export type OwnL1ReaderConfig = {
  /** The RPC Url of the ethereum debug host for trace and debug methods. */
  l1DebugRpcUrls: string[];
  /** The polling interval viem uses in ms */
  viemPollingIntervalMS: number;
  /** Timeout for HTTP requests to the L1 RPC node in ms. */
  l1HttpTimeoutMS?: number;
};
export type L1ReaderConfig = OwnL1ReaderConfig & L1ChainIdConfig & L1RpcUrlsConfig & L1ContractAddresses;

const ownL1ReaderConfigMappings: ConfigMappingsType<OwnL1ReaderConfig> = {
  l1DebugRpcUrls: {
    env: 'ETHEREUM_DEBUG_HOSTS',
    description: 'The RPC Url of the ethereum debug host for trace and debug methods.',
    parseEnv: parseCommaSeparated,
    defaultValue: [],
  },
  viemPollingIntervalMS: {
    env: 'L1_READER_VIEM_POLLING_INTERVAL_MS',
    description: 'The polling interval viem uses in ms',
    ...numberConfigHelper(1_000),
  },
  l1HttpTimeoutMS: {
    env: 'ETHEREUM_HTTP_TIMEOUT_MS',
    description: 'Timeout for HTTP requests to the L1 RPC node in ms.',
    ...optionalNumberConfigHelper(),
  },
};

export const l1ReaderConfigMappings: ConfigMappingsType<L1ReaderConfig> = composeConfigMappings(
  ownL1ReaderConfigMappings,
  l1ChainIdConfigMappings,
  l1RpcUrlsConfigMappings,
  l1ContractAddressesMapping,
);

export function getL1ReaderConfigFromEnv(): L1ReaderConfig {
  return getConfigFromMappings<L1ReaderConfig>(l1ReaderConfigMappings);
}
