import { type ChainConfig, chainConfigMappings } from '@aztec/circuit-types/config';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  pickConfigMappings,
} from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

import { type P2PReqRespConfig, p2pReqRespConfigMappings } from './services/reqresp/config.js';

/**
 * P2P client configuration values.
 */
export interface P2PConfig extends P2PReqRespConfig, ChainConfig {
  /**
   * A flag dictating whether the P2P subsystem should be enabled.
   */
  p2pEnabled: boolean;

  /**
   * The frequency in which to check for new L2 blocks.
   */
  blockCheckIntervalMS: number;

  /**
   * The number of blocks to fetch in a single batch.
   */
  blockRequestBatchSize: number;

  /**
   * DEBUG: Disable message validation - for testing purposes only
   */
  debugDisableMessageValidation: boolean;

  /**
   * DEBUG: Disable colocation penalty - for testing purposes only
   */
  debugDisableColocationPenalty: boolean;

  /**
   * The frequency in which to check for new peers.
   */
  peerCheckIntervalMS: number;

  /**
   * Size of queue of L2 blocks to store.
   */
  l2QueueSize: number;

  /**
   * The announce address for TCP.
   */
  tcpAnnounceAddress?: string;

  /**
   * The announce address for UDP.
   */
  udpAnnounceAddress?: string;

  /**
   * The listen address for TCP.
   */
  tcpListenAddress: string;

  /**
   * The listen address for UDP.
   */
  udpListenAddress: string;

  /**
   * An optional peer id private key. If blank, will generate a random key.
   */
  peerIdPrivateKey?: string;

  /**
   * A list of bootstrap peers to connect to.
   */
  bootstrapNodes: string[];

  /** Whether to execute the version check in the bootstrap node ENR. */
  bootstrapNodeEnrVersionCheck: boolean;

  /**
   * Protocol identifier for transaction gossiping.
   */
  transactionProtocol: string;

  /**
   * The maximum number of peers (a peer count above this will cause the node to refuse connection attempts)
   */
  maxPeerCount: number;

  /**
   * If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.
   */
  queryForIp: boolean;

  /** How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven) */
  keepProvenTxsInPoolFor: number;

  /** How many slots to keep attestations for. */
  keepAttestationsInPoolFor: number;

  /**
   * The interval of the gossipsub heartbeat to perform maintenance tasks.
   */
  gossipsubInterval: number;

  /**
   * The D parameter for the gossipsub protocol.
   */
  gossipsubD: number;

  /**
   * The Dlo parameter for the gossipsub protocol.
   */
  gossipsubDlo: number;

  /**
   * The Dhi parameter for the gossipsub protocol.
   */
  gossipsubDhi: number;

  /**
   * The Dlazy parameter for the gossipsub protocol.
   */
  gossipsubDLazy: number;

  /**
   * Whether to flood publish messages. - For testing purposes only
   */
  gossipsubFloodPublish: boolean;

  /**
   * The number of gossipsub interval message cache windows to keep.
   */
  gossipsubMcacheLength: number;

  /**
   * How many message cache windows to include when gossiping with other peers.
   */
  gossipsubMcacheGossip: number;

  /**
   * The 'age' (in # of L2 blocks) of a processed tx after which we heavily penalize a peer for re-sending it.
   */
  severePeerPenaltyBlockLength: number;

  /**
   * The weight of the tx topic for the gossipsub protocol.  This determines how much the score for this specific topic contributes to the overall peer score.
   */
  gossipsubTxTopicWeight: number;

  /**
   * This is the weight applied to the penalty for delivering invalid messages.
   */
  gossipsubTxInvalidMessageDeliveriesWeight: number;

  /**
   * determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1.
   */
  gossipsubTxInvalidMessageDeliveriesDecay: number;

  /**
   * The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.
   */
  peerPenaltyValues: number[];

  /** Limit of transactions to archive in the tx pool. Once the archived tx limit is reached, the oldest archived txs will be purged. */
  archivedTxLimit: number;
}

export const p2pConfigMappings: ConfigMappingsType<P2PConfig> = {
  p2pEnabled: {
    env: 'P2P_ENABLED',
    description: 'A flag dictating whether the P2P subsystem should be enabled.',
    ...booleanConfigHelper(),
  },
  blockCheckIntervalMS: {
    env: 'P2P_BLOCK_CHECK_INTERVAL_MS',
    description: 'The frequency in which to check for new L2 blocks.',
    ...numberConfigHelper(100),
  },
  debugDisableMessageValidation: {
    env: 'DEBUG_P2P_DISABLE_MESSAGE_VALIDATION',
    description: 'DEBUG: Disable message validation - NEVER set to true in production',
    ...booleanConfigHelper(false),
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
  tcpListenAddress: {
    env: 'P2P_TCP_LISTEN_ADDR',
    defaultValue: '0.0.0.0:40400',
    description: 'The listen address for TCP. Format: <IP_ADDRESS>:<PORT>.',
  },
  udpListenAddress: {
    env: 'P2P_UDP_LISTEN_ADDR',
    defaultValue: '0.0.0.0:40400',
    description: 'The listen address for UDP. Format: <IP_ADDRESS>:<PORT>.',
  },
  tcpAnnounceAddress: {
    env: 'P2P_TCP_ANNOUNCE_ADDR',
    description:
      'The announce address for TCP. Format: <IP_ADDRESS>:<PORT>. Leave IP_ADDRESS blank to query for public IP.',
  },
  udpAnnounceAddress: {
    env: 'P2P_UDP_ANNOUNCE_ADDR',
    description:
      'The announce address for UDP. Format: <IP_ADDRESS>:<PORT>. Leave IP_ADDRESS blank to query for public IP.',
  },
  peerIdPrivateKey: {
    env: 'PEER_ID_PRIVATE_KEY',
    description: 'An optional peer id private key. If blank, will generate a random key.',
  },
  bootstrapNodes: {
    env: 'BOOTSTRAP_NODES',
    parseEnv: (val: string) => val.split(','),
    description: 'A list of bootstrap peer ENRs to connect to. Separated by commas.',
  },
  bootstrapNodeEnrVersionCheck: {
    env: 'P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK',
    description: 'Whether to check the version of the bootstrap node ENR.',
    ...booleanConfigHelper(),
  },
  transactionProtocol: {
    env: 'P2P_TX_PROTOCOL',
    description: 'Protocol identifier for transaction gossiping.',
    defaultValue: '/aztec/0.1.0',
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
  keepProvenTxsInPoolFor: {
    env: 'P2P_TX_POOL_KEEP_PROVEN_FOR',
    description:
      'How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven)',
    ...numberConfigHelper(0),
  },
  keepAttestationsInPoolFor: {
    env: 'P2P_ATTESTATION_POOL_KEEP_FOR',
    description: 'How many slots to keep attestations for.',
    ...numberConfigHelper(96),
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
    ...numberConfigHelper(6),
  },
  gossipsubFloodPublish: {
    env: 'P2P_GOSSIPSUB_FLOOD_PUBLISH',
    description: 'Whether to flood publish messages. - For testing purposes only',
    ...booleanConfigHelper(true),
  },
  gossipsubMcacheLength: {
    env: 'P2P_GOSSIPSUB_MCACHE_LENGTH',
    description: 'The number of gossipsub interval message cache windows to keep.',
    ...numberConfigHelper(6),
  },
  gossipsubMcacheGossip: {
    env: 'P2P_GOSSIPSUB_MCACHE_GOSSIP',
    description: 'How many message cache windows to include when gossiping with other pears.',
    ...numberConfigHelper(3),
  },
  peerPenaltyValues: {
    env: 'P2P_PEER_PENALTY_VALUES',
    parseEnv: (val: string) => val.split(',').map(Number),
    description:
      'The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.',
    defaultValue: [2, 10, 50],
  },
  severePeerPenaltyBlockLength: {
    env: 'P2P_SEVERE_PEER_PENALTY_BLOCK_LENGTH',
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
  ...p2pReqRespConfigMappings,
  ...chainConfigMappings,
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
export type BootnodeConfig = Pick<P2PConfig, 'udpAnnounceAddress' | 'peerIdPrivateKey' | 'maxPeerCount'> &
  Required<Pick<P2PConfig, 'udpListenAddress'>> &
  Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKB'> &
  ChainConfig;

const bootnodeConfigKeys: (keyof BootnodeConfig)[] = [
  'udpAnnounceAddress',
  'peerIdPrivateKey',
  'maxPeerCount',
  'udpListenAddress',
  'dataDirectory',
  'dataStoreMapSizeKB',
];

export const bootnodeConfigMappings = pickConfigMappings(
  { ...p2pConfigMappings, ...dataConfigMappings },
  bootnodeConfigKeys,
);
