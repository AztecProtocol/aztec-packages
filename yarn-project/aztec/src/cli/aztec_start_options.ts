import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import { blobClientConfigMapping } from '@aztec/blob-client/client/config';
import { botConfigMappings } from '@aztec/bot/config';
import { l1ContractsConfigMappings } from '@aztec/ethereum/config';
import { l1ContractAddressesMapping } from '@aztec/ethereum/l1-contract-addresses';
import { l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import { getKeys } from '@aztec/foundation/collection';
import {
  type ConfigMapping,
  type EnvVar,
  booleanConfigHelper,
  isBooleanConfigValue,
  omitConfigMappings,
} from '@aztec/foundation/config';
import { dataConfigMappings } from '@aztec/kv-store/config';
import { sharedNodeConfigMappings } from '@aztec/node-lib/config';
import { bootnodeConfigMappings, p2pConfigMappings } from '@aztec/p2p/config';
import { proverAgentConfigMappings, proverBrokerConfigMappings } from '@aztec/prover-client/broker/config';
import { proverNodeConfigMappings } from '@aztec/prover-node/config';
import { allPxeConfigMappings } from '@aztec/pxe/config';
import { sequencerClientConfigMappings } from '@aztec/sequencer-client/config';
import { chainConfigMappings, nodeRpcConfigMappings } from '@aztec/stdlib/config';
import { telemetryClientConfigMappings } from '@aztec/telemetry-client/config';
import { worldStateConfigMappings } from '@aztec/world-state/config';

import { DefaultMnemonic } from '../mnemonic.js';

// Define an interface for options
export interface AztecStartOption {
  flag: string;
  description: string;
  defaultValue: any;
  printDefault?: (val: any) => string;
  env: EnvVar | undefined;
  fallback?: EnvVar[];
  parseVal?: (val: string) => any;
}

export const getOptions = (namespace: string, configMappings: Record<string, ConfigMapping<unknown>>) => {
  const options: AztecStartOption[] = [];
  for (const [key, { env, defaultValue: def, parseEnv, description, printDefault, fallback }] of Object.entries(
    configMappings,
  )) {
    if (universalOptions.includes(key)) {
      continue;
    }
    const isBoolean = isBooleanConfigValue(configMappings, key as keyof typeof configMappings);
    options.push({
      flag: `--${namespace}.${key}${isBoolean ? '' : ' <value>'}`,
      description,
      defaultValue: def,
      printDefault,
      env: env,
      fallback,
      parseVal: parseEnv,
    });
  }
  return options;
};

const configToFlag = (
  flag: string,
  configMapping: ConfigMapping<unknown>,
  overrideDefaultValue?: any,
): AztecStartOption => {
  if (!configMapping.isBoolean) {
    flag += ' <value>';
  }

  const flagConfig: AztecStartOption = {
    flag,
    env: undefined,
    defaultValue: undefined,
    parseVal: configMapping.parseEnv,
    ...configMapping,
  };

  if (overrideDefaultValue !== undefined) {
    flagConfig.defaultValue = overrideDefaultValue;
  }

  return flagConfig;
};

// These are options used by multiple modules so should be inputted once
export const universalOptions = [
  'l1ConsensusHostUrls',
  'l1ConsensusHostApiKeys',
  'l1ConsensusHostApiKeyHeaders',
  'p2pEnabled',
  'fishermanMode',
  ...getKeys(chainConfigMappings),
  ...getKeys(l1ContractsConfigMappings),
  ...getKeys(l1ContractAddressesMapping),
  ...getKeys(l1ReaderConfigMappings),
  ...getKeys(dataConfigMappings),
  ...getKeys(worldStateConfigMappings),
];

export const NETWORK_FLAG = 'network';

// Define categories and options
export const aztecStartOptions: { [key: string]: AztecStartOption[] } = {
  MISC: [
    {
      flag: `--${NETWORK_FLAG} <value>`,
      description: 'Network to run Aztec on',
      defaultValue: undefined,
      env: 'NETWORK',
    },

    configToFlag('--enable-version-check', sharedNodeConfigMappings.enableVersionCheck),

    configToFlag('--sync-mode', sharedNodeConfigMappings.syncMode),
    configToFlag('--snapshots-urls', sharedNodeConfigMappings.snapshotsUrls),

    configToFlag('--fisherman-mode', sharedNodeConfigMappings.fishermanMode),
  ],
  LOCAL_NETWORK: [
    {
      flag: '--local-network',
      description: 'Starts Aztec Local Network',
      defaultValue: undefined,
      env: undefined,
    },
    {
      flag: '--local-network.l1Mnemonic <value>',
      description: 'Mnemonic for L1 accounts. Will be used ',
      defaultValue: DefaultMnemonic,
      env: 'MNEMONIC',
    },
    {
      flag: '--local-network.testAccounts',
      description: 'Deploy test accounts on local network start',
      env: 'TEST_ACCOUNTS',
      ...booleanConfigHelper(true),
    },
  ],
  API: [
    {
      flag: '--port <value>',
      description: 'Port to run the Aztec Services on',
      defaultValue: 8080,
      env: 'AZTEC_PORT',
      parseVal: val => parseInt(val, 10),
    },
    {
      flag: '--admin-port <value>',
      description: 'Port to run admin APIs of Aztec Services on',
      defaultValue: 8880,
      env: 'AZTEC_ADMIN_PORT',
      parseVal: val => parseInt(val, 10),
    },
    {
      flag: '--admin-api-key-hash <value>',
      description:
        'SHA-256 hex hash of a pre-generated admin API key. When set, the node uses this hash for authentication instead of auto-generating a key.',
      defaultValue: undefined,
      env: 'AZTEC_ADMIN_API_KEY_HASH',
    },
    {
      flag: '--disable-admin-api-key',
      description:
        'Disable API key authentication on the admin RPC endpoint. By default, a key is auto-generated, displayed once, and its hash is persisted.',
      defaultValue: false,
      env: 'AZTEC_DISABLE_ADMIN_API_KEY',
      // undefined means the flag was passed without a value (boolean toggle), treat as true.
      parseVal: val => val === undefined || val === 'true' || val === '1',
    },
    {
      flag: '--reset-admin-api-key',
      description:
        'Force-generate a new admin API key, replacing any previously persisted key hash. The new key is displayed once at startup.',
      defaultValue: false,
      env: 'AZTEC_RESET_ADMIN_API_KEY',
      parseVal: val => val === 'true' || val === '1',
    },
    {
      flag: '--node-debug',
      description: 'Expose debug endpoints (e.g. mineBlock) on the main RPC port',
      defaultValue: false,
      env: 'AZTEC_NODE_DEBUG',
      parseVal: val => val === undefined || val === 'true' || val === '1',
    },
    {
      flag: '--api-prefix <value>',
      description: 'Prefix for API routes on any service that is started',
      defaultValue: '',
      env: 'API_PREFIX',
    },
    configToFlag('--rpcMaxBatchSize', nodeRpcConfigMappings.rpcMaxBatchSize),
    configToFlag('--rpcMaxBodySize', nodeRpcConfigMappings.rpcMaxBodySize),
  ],
  ETHEREUM: [
    configToFlag('--l1-chain-id', l1ReaderConfigMappings.l1ChainId),
    // Do not set default for CLI: keep undefined unless provided via flag or env
    configToFlag('--l1-rpc-urls', { ...l1ReaderConfigMappings.l1RpcUrls, defaultValue: undefined }),
    configToFlag('--l1-consensus-host-urls', blobClientConfigMapping.l1ConsensusHostUrls),
    configToFlag('--l1-consensus-host-api-keys', blobClientConfigMapping.l1ConsensusHostApiKeys),
    configToFlag('--l1-consensus-host-api-key-headers', blobClientConfigMapping.l1ConsensusHostApiKeyHeaders),
  ],
  'L1 CONTRACTS': [
    configToFlag('--registry-address', l1ContractAddressesMapping.registryAddress),
    configToFlag('--rollup-version', chainConfigMappings.rollupVersion),
  ],
  STORAGE: [
    configToFlag('--data-directory', dataConfigMappings.dataDirectory),
    configToFlag('--data-store-map-size-kb', dataConfigMappings.dataStoreMapSizeKb),
  ],
  'WORLD STATE': [
    configToFlag('--world-state-data-directory', worldStateConfigMappings.worldStateDataDirectory),
    configToFlag('--world-state-db-map-size-kb', worldStateConfigMappings.worldStateDbMapSizeKb),
    configToFlag('--world-state-checkpoint-history', worldStateConfigMappings.worldStateCheckpointHistory),
  ],
  // We can't easily auto-generate node options as they're parts of modules defined below
  'AZTEC NODE': [
    {
      flag: '--node',
      description: 'Starts Aztec Node with options',
      defaultValue: undefined,
      env: undefined,
    },
  ],
  ARCHIVER: [
    ...getOptions(
      'archiver',
      omitConfigMappings(archiverConfigMappings, Object.keys(l1ContractsConfigMappings) as (keyof ArchiverConfig)[]),
    ),
  ],
  SEQUENCER: [
    {
      flag: '--sequencer',
      description: 'Starts Aztec Sequencer with options',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions(
      'sequencer',
      omitConfigMappings(sequencerClientConfigMappings, [
        'fakeProcessingDelayPerTxMs',
        'fakeThrowAfterProcessingTxCount',
        'skipCollectingAttestations',
        'skipInvalidateBlockAsProposer',
        'blobSinkMapSizeKb',
      ]),
    ),
  ],
  'PROVER NODE': [
    {
      flag: '--prover-node',
      description: 'Starts Aztec Prover Node with options',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions(
      'proverNode',
      omitConfigMappings(proverNodeConfigMappings, [
        // filter out options passed separately
        ...getKeys(proverBrokerConfigMappings),
        ...getKeys(proverAgentConfigMappings),
      ]),
    ),
  ],
  'PROVER BROKER': [
    {
      flag: '--prover-broker',
      description: 'Starts Aztec proving job broker',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions('proverBroker', proverBrokerConfigMappings),
  ],
  'PROVER AGENT': [
    {
      flag: '--prover-agent',
      description: 'Starts Aztec Prover Agent with options',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions('proverAgent', proverAgentConfigMappings),
  ],
  'P2P SUBSYSTEM': [
    {
      flag: '--p2p-enabled [value]',
      description: 'Enable P2P subsystem',
      env: 'P2P_ENABLED',
      ...booleanConfigHelper(),
    },
    ...getOptions('p2p', p2pConfigMappings),
  ],
  'P2P BOOTSTRAP': [
    {
      flag: '--p2p-bootstrap',
      description: 'Starts Aztec P2P Bootstrap with options',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions(
      'p2pBootstrap',
      omitConfigMappings(bootnodeConfigMappings, [
        'p2pIp',
        'p2pPort',
        'peerIdPrivateKey',
        'bootstrapNodes',
        'listenAddress',
      ]),
    ),
  ],
  TELEMETRY: [...getOptions('tel', telemetryClientConfigMappings)],
  BOT: [
    {
      flag: '--bot',
      description: 'Starts Aztec Bot with options',
      defaultValue: undefined,
      env: undefined,
    },
    ...getOptions('bot', botConfigMappings),
  ],
  PXE: [...getOptions('pxe', allPxeConfigMappings)],
  TXE: [
    {
      flag: '--txe',
      description: 'Starts Aztec TXE with options',
      defaultValue: undefined,
      env: undefined,
    },
  ],
};
