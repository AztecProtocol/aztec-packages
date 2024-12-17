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
export interface P2PConfig extends P2PReqRespConfig {
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

  /**
   * Protocol identifier for transaction gossiping.
   */
  transactionProtocol: string;

  /**
   * The minimum number of peers (a peer count below this will cause the node to look for more peers)
   */
  minPeerCount: number;

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
   * The number of gossipsub interval message cache windows to keep.
   */
  gossipsubMcacheLength: number;

  /**
   * How many message cache windows to include when gossiping with other pears.
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

  /**
   * The chain id of the L1 chain.
   */
  l1ChainId: number;
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
  peerCheckIntervalMS: {
    env: 'P2P_PEER_CHECK_INTERVAL_MS',
    description: 'The frequency in which to check for new peers.',
    ...numberConfigHelper(1_000),
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
  transactionProtocol: {
    env: 'P2P_TX_PROTOCOL',
    description: 'Protocol identifier for transaction gossiping.',
    defaultValue: '/aztec/0.1.0',
  },
  minPeerCount: {
    env: 'P2P_MIN_PEERS',
    description: 'The minimum number of peers to connect to.',
    ...numberConfigHelper(10),
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
    ...numberConfigHelper(1_000),
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
  gossipsubMcacheLength: {
    env: 'P2P_GOSSIPSUB_MCACHE_LENGTH',
    description: 'The number of gossipsub interval message cache windows to keep.',
    ...numberConfigHelper(5),
  },
  gossipsubMcacheGossip: {
    env: 'P2P_GOSSIPSUB_MCACHE_GOSSIP',
    description: 'How many message cache windows to include when gossiping with other pears.',
    ...numberConfigHelper(3),
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
  severePeerPenaltyBlockLength: {
    env: 'P2P_SEVERE_PEER_PENALTY_BLOCK_LENGTH',
    description: 'The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it.',
    ...numberConfigHelper(30),
  },
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    description: 'The chain id of the L1 chain.',
    ...numberConfigHelper(31337),
  },
  blockRequestBatchSize: {
    env: 'P2P_BLOCK_REQUEST_BATCH_SIZE',
    description: 'The number of blocks to fetch in a single batch.',
    ...numberConfigHelper(20),
  },
  ...p2pReqRespConfigMappings,
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
  'udpAnnounceAddress' | 'peerIdPrivateKey' | 'minPeerCount' | 'maxPeerCount'
> &
  Required<Pick<P2PConfig, 'udpListenAddress'>> &
  Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKB'>;

const bootnodeConfigKeys: (keyof BootnodeConfig)[] = [
  'udpAnnounceAddress',
  'peerIdPrivateKey',
  'minPeerCount',
  'maxPeerCount',
  'udpListenAddress',
  'dataDirectory',
  'dataStoreMapSizeKB',
];

export const bootnodeConfigMappings = pickConfigMappings(
  { ...p2pConfigMappings, ...dataConfigMappings },
  bootnodeConfigKeys,
);
