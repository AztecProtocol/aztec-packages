import {
  type ConfigMappingsType,
  SecretValue,
  booleanConfigHelper,
  floatConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  pickConfigMappings,
  secretStringConfigHelper,
} from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type AllowedElement, type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';

import { type P2PReqRespConfig, p2pReqRespConfigMappings } from './services/reqresp/config.js';
import { type TxCollectionConfig, txCollectionConfigMappings } from './services/tx_collection/config.js';

/**
 * P2P client configuration values.
 */
export interface P2PConfig extends P2PReqRespConfig, ChainConfig, TxCollectionConfig {
  /** A flag dictating whether the P2P subsystem should be enabled. */
  p2pEnabled: boolean;

  /** The frequency in which to check for new L2 blocks. */
  blockCheckIntervalMS: number;

  /** The number of blocks to fetch in a single batch. */
  blockRequestBatchSize: number;

  /** DEBUG: Disable colocation penalty - for testing purposes only */
  debugDisableColocationPenalty: boolean;

  /** The frequency in which to check for new peers. */
  peerCheckIntervalMS: number;

  /** Size of queue of L2 blocks to store. */
  l2QueueSize: number;

  /** The port for the P2P service. */
  p2pPort: number;

  /** The port to broadcast the P2P service on (included in the node's ENR). */
  p2pBroadcastPort?: number;

  /** The IP address for the P2P service. */
  p2pIp?: string;

  /** The listen address. */
  listenAddress: string;

  /** An optional peer id private key. If blank, will generate a random key. */
  peerIdPrivateKey?: SecretValue<string>;

  /** An optional path to store generated peer id private keys. If blank, will default to storing any generated keys in the data directory. */
  peerIdPrivateKeyPath?: string;

  /** A list of bootstrap peers to connect to. */
  bootstrapNodes: string[];

  /** Whether to execute the version check in the bootstrap node ENR. */
  bootstrapNodeEnrVersionCheck: boolean;

  /** Whether to consider any configured bootnodes as full peers, e.g. for transaction gossiping */
  bootstrapNodesAsFullPeers: boolean;

  /** The maximum number of peers (a peer count above this will cause the node to refuse connection attempts) */
  maxPeerCount: number;

  /** If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false. */
  queryForIp: boolean;

  /** The interval of the gossipsub heartbeat to perform maintenance tasks. */
  gossipsubInterval: number;

  /** The D parameter for the gossipsub protocol. */
  gossipsubD: number;

  /** The Dlo parameter for the gossipsub protocol. */
  gossipsubDlo: number;

  /** The Dhi parameter for the gossipsub protocol. */
  gossipsubDhi: number;

  /** The Dlazy parameter for the gossipsub protocol. */
  gossipsubDLazy: number;

  /** Whether to flood publish messages. - For testing purposes only */
  gossipsubFloodPublish: boolean;

  /** The number of gossipsub interval message cache windows to keep. */
  gossipsubMcacheLength: number;

  /** How many message cache windows to include when gossiping with other pears. */
  gossipsubMcacheGossip: number;

  /** How long to keep message IDs in the seen cache (ms). */
  gossipsubSeenTTL: number;

  /** The 'age' (in # of L2 blocks) of a processed tx after which we heavily penalize a peer for re-sending it. */
  doubleSpendSeverePeerPenaltyWindow: number;

  /** The weight of the tx topic for the gossipsub protocol.  This determines how much the score for this specific topic contributes to the overall peer score. */
  gossipsubTxTopicWeight: number;

  /** This is the weight applied to the penalty for delivering invalid messages. */
  gossipsubTxInvalidMessageDeliveriesWeight: number;

  /** determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1. */
  gossipsubTxInvalidMessageDeliveriesDecay: number;

  /** The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors. */
  peerPenaltyValues: number[];

  /** Limit of transactions to archive in the tx pool. Once the archived tx limit is reached, the oldest archived txs will be purged. */
  archivedTxLimit: number;

  /** A list of trusted peers. */
  trustedPeers: string[];

  /** A list of private peers. */
  privatePeers: string[];

  /** A list of preferred peers. */
  preferredPeers: string[];

  /** The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKB. */
  p2pStoreMapSizeKb?: number;

  /** Which calls are allowed in the public setup phase of a tx. */
  txPublicSetupAllowList: AllowedElement[];

  /** The maximum cumulative tx size (in bytes) of pending txs before evicting lower priority txs. */
  maxTxPoolSize: number;

  /** If the pool is full, it will still accept a few more txs until it reached maxTxPoolOverspillFactor * maxTxPoolSize. Then it will evict */
  txPoolOverflowFactor: number;

  /** The node's seen message ID cache size */
  seenMessageCacheSize: number;

  /** True to disable the status handshake on peer connected. */
  p2pDisableStatusHandshake?: boolean;

  /** True to only permit validators to connect */
  p2pAllowOnlyValidators?: boolean;

  /** True to disable participating in discovery */
  p2pDiscoveryDisabled?: boolean;
}

export const DEFAULT_P2P_PORT = 40400;

export const p2pConfigMappings: ConfigMappingsType<P2PConfig> = {
  p2pEnabled: {
    env: 'P2P_ENABLED',
    description: 'A flag dictating whether the P2P subsystem should be enabled.',
    ...booleanConfigHelper(),
  },
  p2pDiscoveryDisabled: {
    env: 'P2P_DISCOVERY_DISABLED',
    description: 'A flag dictating whether the P2P discovery system should be disabled.',
    ...booleanConfigHelper(false),
  },
  blockCheckIntervalMS: {
    env: 'P2P_BLOCK_CHECK_INTERVAL_MS',
    description: 'The frequency in which to check for new L2 blocks.',
    ...numberConfigHelper(100),
  },
  debugDisableColocationPenalty: {
    env: 'DEBUG_P2P_DISABLE_COLOCATION_PENALTY',
    description: 'DEBUG: Disable colocation penalty - NEVER set to true in production',
    ...booleanConfigHelper(false),
  },
  peerCheckIntervalMS: {
    env: 'P2P_PEER_CHECK_INTERVAL_MS',
    description: 'The frequency in which to check for new peers.',
    ...numberConfigHelper(30_000),
  },
  l2QueueSize: {
    env: 'P2P_L2_QUEUE_SIZE',
    description: 'Size of queue of L2 blocks to store.',
    ...numberConfigHelper(1_000),
  },
  listenAddress: {
    env: 'P2P_LISTEN_ADDR',
    defaultValue: '0.0.0.0',
    description: 'The listen address. ipv4 address.',
  },
  p2pPort: {
    env: 'P2P_PORT',
    description: `The port for the P2P service. Defaults to ${DEFAULT_P2P_PORT}`,
    ...numberConfigHelper(DEFAULT_P2P_PORT),
  },
  p2pBroadcastPort: {
    env: 'P2P_BROADCAST_PORT',
    description: `The port to broadcast the P2P service on (included in the node's ENR). Defaults to P2P_PORT.`,
  },
  p2pIp: {
    env: 'P2P_IP',
    description: 'The IP address for the P2P service. ipv4 address.',
  },
  peerIdPrivateKey: {
    env: 'PEER_ID_PRIVATE_KEY',
    description: 'An optional peer id private key. If blank, will generate a random key.',
    ...secretStringConfigHelper(),
  },
  peerIdPrivateKeyPath: {
    env: 'PEER_ID_PRIVATE_KEY_PATH',
    description:
      'An optional path to store generated peer id private keys. If blank, will default to storing any generated keys in the root of the data directory.',
  },
  bootstrapNodes: {
    env: 'BOOTSTRAP_NODES',
    parseEnv: (val: string) => val.split(','),
    description: 'A list of bootstrap peer ENRs to connect to. Separated by commas.',
    defaultValue: [],
  },
  bootstrapNodeEnrVersionCheck: {
    env: 'P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK',
    description: 'Whether to check the version of the bootstrap node ENR.',
    ...booleanConfigHelper(),
  },
  bootstrapNodesAsFullPeers: {
    env: 'P2P_BOOTSTRAP_NODES_AS_FULL_PEERS',
    description: 'Whether to consider our configured bootnodes as full peers',
    ...booleanConfigHelper(false),
  },
  maxPeerCount: {
    env: 'P2P_MAX_PEERS',
    description: 'The maximum number of peers to connect to.',
    ...numberConfigHelper(100),
  },
  queryForIp: {
    env: 'P2P_QUERY_FOR_IP',
    description:
      'If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.',
    ...booleanConfigHelper(),
  },
  gossipsubInterval: {
    env: 'P2P_GOSSIPSUB_INTERVAL_MS',
    description: 'The interval of the gossipsub heartbeat to perform maintenance tasks.',
    ...numberConfigHelper(700),
  },
  gossipsubD: {
    env: 'P2P_GOSSIPSUB_D',
    description: 'The D parameter for the gossipsub protocol.',
    ...numberConfigHelper(8),
  },
  gossipsubDlo: {
    env: 'P2P_GOSSIPSUB_DLO',
    description: 'The Dlo parameter for the gossipsub protocol.',
    ...numberConfigHelper(4),
  },
  gossipsubDhi: {
    env: 'P2P_GOSSIPSUB_DHI',
    description: 'The Dhi parameter for the gossipsub protocol.',
    ...numberConfigHelper(12),
  },
  gossipsubDLazy: {
    env: 'P2P_GOSSIPSUB_DLAZY',
    description: 'The Dlazy parameter for the gossipsub protocol.',
    ...numberConfigHelper(8),
  },
  gossipsubFloodPublish: {
    env: 'P2P_GOSSIPSUB_FLOOD_PUBLISH',
    description: 'Whether to flood publish messages. - For testing purposes only',
    ...booleanConfigHelper(false),
  },
  gossipsubMcacheLength: {
    env: 'P2P_GOSSIPSUB_MCACHE_LENGTH',
    description: 'The number of gossipsub interval message cache windows to keep.',
    ...numberConfigHelper(6),
  },
  gossipsubMcacheGossip: {
    env: 'P2P_GOSSIPSUB_MCACHE_GOSSIP',
    description: 'How many message cache windows to include when gossiping with other peers.',
    ...numberConfigHelper(3),
  },
  gossipsubSeenTTL: {
    env: 'P2P_GOSSIPSUB_SEEN_TTL',
    description: 'How long to keep message IDs in the seen cache.',
    ...numberConfigHelper(20 * 60 * 1000),
  },
  gossipsubTxTopicWeight: {
    env: 'P2P_GOSSIPSUB_TX_TOPIC_WEIGHT',
    description: 'The weight of the tx topic for the gossipsub protocol.',
    ...numberConfigHelper(1),
  },
  gossipsubTxInvalidMessageDeliveriesWeight: {
    env: 'P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_WEIGHT',
    description: 'The weight of the tx invalid message deliveries for the gossipsub protocol.',
    ...numberConfigHelper(-20),
  },
  gossipsubTxInvalidMessageDeliveriesDecay: {
    env: 'P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_DECAY',
    description: 'Determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1.',
    ...numberConfigHelper(0.5),
  },
  peerPenaltyValues: {
    env: 'P2P_PEER_PENALTY_VALUES',
    parseEnv: (val: string) => val.split(',').map(Number),
    description:
      'The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.',
    defaultValue: [2, 10, 50],
  },
  doubleSpendSeverePeerPenaltyWindow: {
    env: 'P2P_DOUBLE_SPEND_SEVERE_PEER_PENALTY_WINDOW',
    description: 'The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it.',
    ...numberConfigHelper(30),
  },
  blockRequestBatchSize: {
    env: 'P2P_BLOCK_REQUEST_BATCH_SIZE',
    description: 'The number of blocks to fetch in a single batch.',
    ...numberConfigHelper(20),
  },
  archivedTxLimit: {
    env: 'P2P_ARCHIVED_TX_LIMIT',
    description:
      'The number of transactions that will be archived. If the limit is set to 0 then archiving will be disabled.',
    ...numberConfigHelper(0),
  },
  trustedPeers: {
    env: 'P2P_TRUSTED_PEERS',
    parseEnv: (val: string) => val.split(','),
    description: 'A list of trusted peer ENRs that will always be persisted. Separated by commas.',
    defaultValue: [],
  },
  privatePeers: {
    env: 'P2P_PRIVATE_PEERS',
    parseEnv: (val: string) => val.split(','),
    description:
      'A list of private peer ENRs that will always be persisted and not be used for discovery. Separated by commas.',
    defaultValue: [],
  },
  preferredPeers: {
    env: 'P2P_PREFERRED_PEERS',
    parseEnv: (val: string) => val.split(','),
    description:
      'A list of preferred peer ENRs that will always be persisted and not be used for discovery. Separated by commas.',
    defaultValue: [],
  },
  p2pStoreMapSizeKb: {
    env: 'P2P_STORE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKB.',
  },
  txPublicSetupAllowList: {
    env: 'TX_PUBLIC_SETUP_ALLOWLIST',
    parseEnv: (val: string) => parseAllowList(val),
    description: 'The list of functions calls allowed to run in setup',
    printDefault: () =>
      'AuthRegistry, FeeJuice.increase_public_balance, Token.increase_public_balance, FPC.prepare_fee',
  },
  maxTxPoolSize: {
    env: 'P2P_MAX_TX_POOL_SIZE',
    description: 'The maximum cumulative tx size of pending txs (in bytes) before evicting lower priority txs.',
    ...numberConfigHelper(100_000_000), // 100MB
  },
  txPoolOverflowFactor: {
    env: 'P2P_TX_POOL_OVERFLOW_FACTOR',
    description: 'How much the tx pool can overflow before it starts evicting txs. Must be greater than 1',
    ...floatConfigHelper(1.1), // 10% overflow
  },
  seenMessageCacheSize: {
    env: 'P2P_SEEN_MSG_CACHE_SIZE',
    description: 'The number of messages to keep in the seen message cache',
    ...numberConfigHelper(100_000), // 100K
  },
  p2pDisableStatusHandshake: {
    env: 'P2P_DISABLE_STATUS_HANDSHAKE',
    description: 'True to disable the status handshake on peer connected.',
    ...booleanConfigHelper(false),
  },
  p2pAllowOnlyValidators: {
    env: 'P2P_ALLOW_ONLY_VALIDATORS',
    description: 'True to only permit validators to connect.',
    ...booleanConfigHelper(false),
  },
  ...p2pReqRespConfigMappings,
  ...chainConfigMappings,
  ...txCollectionConfigMappings,
};

/**
 * Gets the config values for p2p client from environment variables.
 * @returns The config values for p2p client.
 */
export function getP2PConfigFromEnv(): P2PConfig {
  return getConfigFromMappings<P2PConfig>(p2pConfigMappings);
}

export function getP2PDefaultConfig(): P2PConfig {
  return getDefaultConfig<P2PConfig>(p2pConfigMappings);
}

/**
 * Required P2P config values for a bootstrap node.
 */
export type BootnodeConfig = Pick<
  P2PConfig,
  | 'p2pIp'
  | 'p2pPort'
  | 'p2pBroadcastPort'
  | 'peerIdPrivateKey'
  | 'peerIdPrivateKeyPath'
  | 'bootstrapNodes'
  | 'listenAddress'
> &
  Required<Pick<P2PConfig, 'p2pIp' | 'p2pPort'>> &
  Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKB'> &
  Pick<ChainConfig, 'l1ChainId'>;

const bootnodeConfigKeys: (keyof BootnodeConfig)[] = [
  'p2pIp',
  'p2pPort',
  'p2pBroadcastPort',
  'listenAddress',
  'peerIdPrivateKey',
  'peerIdPrivateKeyPath',
  'dataDirectory',
  'dataStoreMapSizeKB',
  'bootstrapNodes',
  'l1ChainId',
];

export const bootnodeConfigMappings = pickConfigMappings(
  { ...p2pConfigMappings, ...dataConfigMappings, ...chainConfigMappings },
  bootnodeConfigKeys,
);

/**
 * Parses a string to a list of allowed elements.
 * Each encoded is expected to be of one of the following formats
 * `I:${address}`
 * `I:${address}:${selector}`
 * `C:${classId}`
 * `C:${classId}:${selector}`
 *
 * @param value The string to parse
 * @returns A list of allowed elements
 */
export function parseAllowList(value: string): AllowedElement[] {
  const entries: AllowedElement[] = [];

  if (!value) {
    return entries;
  }

  for (const val of value.split(',')) {
    const [typeString, identifierString, selectorString] = val.split(':');
    const selector = selectorString !== undefined ? FunctionSelector.fromString(selectorString) : undefined;

    if (typeString === 'I') {
      if (selector) {
        entries.push({
          address: AztecAddress.fromString(identifierString),
          selector,
        });
      } else {
        entries.push({
          address: AztecAddress.fromString(identifierString),
        });
      }
    } else if (typeString === 'C') {
      if (selector) {
        entries.push({
          classId: Fr.fromHexString(identifierString),
          selector,
        });
      } else {
        entries.push({
          classId: Fr.fromHexString(identifierString),
        });
      }
    }
  }

  return entries;
}
