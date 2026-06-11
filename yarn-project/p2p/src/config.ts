import {
  type ConfigMappingsType,
  SecretValue,
  bigintConfigHelper,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
  percentageConfigHelper,
  pickConfigMappings,
  secretStringConfigHelper,
} from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi/function-selector';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type AllowedElement,
  type ChainConfig,
  type SequencerConfig,
  chainConfigMappings,
  sharedSequencerConfigMappings,
} from '@aztec/stdlib/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';

import {
  type BatchTxRequesterConfig,
  batchTxRequesterConfigMappings,
} from './services/reqresp/batch-tx-requester/config.js';
import { type P2PReqRespConfig, p2pReqRespConfigMappings } from './services/reqresp/config.js';
import { type TxCollectionConfig, txCollectionConfigMappings } from './services/tx_collection/config.js';
import { type TxFileStoreConfig, txFileStoreConfigMappings } from './services/tx_file_store/config.js';

/**
 * P2P client configuration values.
 */
export interface P2PConfig
  extends P2PReqRespConfig,
    BatchTxRequesterConfig,
    ChainConfig,
    TxCollectionConfig,
    TxFileStoreConfig,
    Pick<
      SequencerConfig,
      | 'expectedBlockProposalsPerSlot'
      | 'l1PublishingTime'
      | 'maxTxsPerBlock'
<<<<<<< HEAD
      | 'attestationPropagationTime'
=======
      | 'checkpointProposalSyncGraceSeconds'
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
      | 'maxBlocksPerCheckpoint'
    >,
    // `blockDurationMs` is optional on the loose `SequencerConfig` but is always populated for p2p via
    // the shared `numberConfigHelper(3000)` mapping, so it is required here.
    Required<Pick<SequencerConfig, 'blockDurationMs'>> {
  /** Maximum transactions per block for validation. Overrides maxTxsPerBlock for gossip validation when set. */
  validateMaxTxsPerBlock?: number;

  /** Maximum transactions per checkpoint for validation. Used as fallback for maxTxsPerBlock when that is not set. */
  validateMaxTxsPerCheckpoint?: number;

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

  /** How long to ban a peer after it fails MAX_DIAL_ATTEMPTS dials. */
  peerFailedBanTimeMs: number;

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

  /**
   * HTTPS URLs that return plain-text public IPv4, tried in order when resolving the announce IP (e.g. when `queryForIp` is true and `p2pIp` is unset).
   */
  publicIpServices: string[];

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

  /** How long (in seconds) a peer is banned for once its score drops below the ban threshold. */
  peerBanDurationSeconds: number;

  /** Limit of transactions to archive in the tx pool. Once the archived tx limit is reached, the oldest archived txs will be purged. */
  archivedTxLimit: number;

  /** A list of trusted peers. */
  trustedPeers: string[];

  /** A list of private peers. */
  privatePeers: string[];

  /** A list of preferred peers. */
  preferredPeers: string[];

  /** The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKb. */
  p2pStoreMapSizeKb?: number;

  /** Additional entries to extend the default setup allow list. */
  txPublicSetupAllowListExtend: AllowedElement[];

  /** The maximum number of pending txs before evicting lower priority txs. */
  maxPendingTxCount: number;

  /** The node's seen message ID cache size */
  seenMessageCacheSize: number;

  /** Maximum number of (validator, tx) pairs to keep in the tx validation LRU cache. */
  txValidationCacheSize: number;

  /** True to disable the status handshake on peer connected. */
  p2pDisableStatusHandshake?: boolean;

  /** True to only permit validators to connect */
  p2pAllowOnlyValidators?: boolean;

  /** True to disable participating in discovery */
  p2pDiscoveryDisabled?: boolean;
  /** Number of auth attempts to allow before peer is banned. Number is inclusive*/
  p2pMaxFailedAuthAttemptsAllowed: number;

  /** Whether transactions are disabled for this node. This means transactions will be rejected at the RPC and P2P layers. */
  disableTransactions: boolean;

  /** The probability that a transaction is discarded (0 = disabled). - For testing purposes only */
  dropTransactionsProbability: number;

  /** Whether to delete transactions from the pool after a reorg instead of moving them back to pending. */
  txPoolDeleteTxsAfterReorg: boolean;

  /** Alters the format of p2p messages to include things like broadcast timestamp FOR TESTING ONLY */
  debugP2PInstrumentMessages: boolean;

  /** Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus */
  fishermanMode: boolean;

  /** Broadcast block proposals even when a conflicting proposal for the same slot already exists in the pool (for testing purposes only). */
  broadcastEquivocatedProposals?: boolean;

  /** Minimum age (ms) a transaction must have been in the pool before it's eligible for block building. */
  minTxPoolAgeMs: number;

  /**
   * Number of full L2 slots to wait after a checkpoint's slot before declaring its txs missing
   * for data-withholding slashing.
   */
  slashDataWithholdingToleranceSlots: number;

  /**
   * Number of L2 slots after a mined block's slot to keep collecting its missing txs. Clamped
   * up so that collection always runs at least until the data-withholding slash verdict is
   * rendered (`block.slot + slashDataWithholdingToleranceSlots + 1`). Defaults to undefined,
   * in which case the tolerance window is used directly.
   */
  p2pMissingTxCollectionDeadlineSlots?: number;

  /** Minimum percentage fee increase required to replace an existing tx via RPC (0 = no bump). */
  priceBumpPercentage: bigint;

  /** Drop incoming block and checkpoint proposals at the libp2p dispatch layer (for testing only) */
  skipIncomingProposals?: boolean;

  /** Accept proposal gossip regardless of slot timing (for testing only). */
  skipProposalSlotValidation?: boolean;

  /**
   * Whether this node skips checkpoint proposal validation and always attests. When set, the checkpoint
   * attestation is created and broadcast before the embedded last block is processed, so it is not delayed
   * past the slot's attestation window by that block's re-execution. Mirrors the validator config flag.
   */
  skipCheckpointProposalValidation?: boolean;
}

export const DEFAULT_P2P_PORT = 40400;

/** Default endpoints used to discover this machine's public IPv4 when `queryForIp` is enabled. */
export const DEFAULT_PUBLIC_IP_SERVICES: string[] = [
  'https://api.ipify.org/',
  'https://checkip.amazonaws.com/',
  'https://ifconfig.me/ip',
  'https://icanhazip.com/',
];

export const p2pConfigMappings: ConfigMappingsType<P2PConfig> = {
  validateMaxTxsPerBlock: {
    env: 'VALIDATOR_MAX_TX_PER_BLOCK',
    description:
      'Maximum transactions per block for validation. Overrides maxTxsPerBlock for gossip validation when set.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxTxsPerCheckpoint: {
    env: 'VALIDATOR_MAX_TX_PER_CHECKPOINT',
    description:
      'Maximum transactions per checkpoint for validation. Used as fallback for maxTxsPerBlock when that is not set.',
    ...optionalNumberConfigHelper(),
  },
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
  peerFailedBanTimeMs: {
    env: 'P2P_PEER_FAILED_BAN_TIME_MS',
    description: 'How long to ban a peer after it fails maximum dial attempts.',
    ...numberConfigHelper(5 * 60 * 1000),
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
  publicIpServices: {
    env: 'P2P_PUBLIC_IP_SERVICES',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    description:
      'Comma-separated HTTPS URLs that return plain-text public IPv4. Used when P2P_QUERY_FOR_IP is true and P2P_IP is unset. Tried in order until one succeeds.',
    defaultValue: DEFAULT_PUBLIC_IP_SERVICES,
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
    ...numberConfigHelper(12),
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
  peerBanDurationSeconds: {
    env: 'P2P_PEER_BAN_DURATION_SECONDS',
    description: 'How long (in seconds) a peer is banned for once its score drops below the ban threshold.',
    ...numberConfigHelper(24 * 60 * 60),
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
    ...optionalNumberConfigHelper(),
    description: 'The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKb.',
  },
  txPublicSetupAllowListExtend: {
    env: 'TX_PUBLIC_SETUP_ALLOWLIST',
    parseEnv: (val: string) => parseAllowList(val),
    description:
      'Additional entries to extend the default setup allow list. Format: I:address:selector[:flags],C:classId:selector[:flags]. Flags: os (onlySelf), rn (rejectNullMsgSender), cl=N (calldataLength), joined with +.',
    printDefault: () =>
      'Default: AuthRegistry._set_authorized, AuthRegistry.set_authorized, FeeJuice._increase_public_balance',
  },
  maxPendingTxCount: {
    env: 'P2P_MAX_PENDING_TX_COUNT',
    description: 'The maximum number of pending txs before evicting lower priority txs.',
    // Worst case scenario: Uncompressed public/private tx is ~ 156kb
    // This implies we are using ~156MB of memory for pending pool
    ...numberConfigHelper(1_000),
  },
  seenMessageCacheSize: {
    env: 'P2P_SEEN_MSG_CACHE_SIZE',
    description: 'The number of messages to keep in the seen message cache',
    ...numberConfigHelper(100_000), // 100K
  },
  txValidationCacheSize: {
    env: 'P2P_TX_VALIDATION_CACHE_SIZE',
    description: 'Maximum number of items to keep in the tx validation LRU cache.',
    ...numberConfigHelper(5_000),
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
  p2pMaxFailedAuthAttemptsAllowed: {
    env: 'P2P_MAX_AUTH_FAILED_ATTEMPTS_ALLOWED',
    description: 'Number of auth attempts to allow before peer is banned. Number is inclusive',
    ...numberConfigHelper(3),
  },
  dropTransactionsProbability: {
    env: 'P2P_DROP_TX_CHANCE',
    description: 'The probability that a transaction is discarded (0 - 1). - For testing purposes only',
    ...percentageConfigHelper(0),
  },
  disableTransactions: {
    env: 'TRANSACTIONS_DISABLED',
    description:
      'Whether transactions are disabled for this node. This means transactions will be rejected at the RPC and P2P layers.',
    ...booleanConfigHelper(false),
  },
  txPoolDeleteTxsAfterReorg: {
    env: 'P2P_TX_POOL_DELETE_TXS_AFTER_REORG',
    description: 'Whether to delete transactions from the pool after a reorg instead of moving them back to pending.',
    ...booleanConfigHelper(false),
  },
  debugP2PInstrumentMessages: {
    env: 'DEBUG_P2P_INSTRUMENT_MESSAGES',
    description: 'Alters the format of p2p messages to include things like broadcast timestamp FOR TESTING ONLY',
    ...booleanConfigHelper(false),
  },
  l1PublishingTime: {
    env: 'SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT',
    description: 'How much time (in seconds) we allow in the slot for publishing the L1 tx (defaults to 1 L1 slot).',
    ...optionalNumberConfigHelper(),
  },
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus.',
    ...booleanConfigHelper(false),
  },
  broadcastEquivocatedProposals: {
    description:
      'Broadcast block proposals even when a conflicting proposal for the same slot already exists in the pool (for testing purposes only).',
    ...booleanConfigHelper(false),
  },
  skipIncomingProposals: {
    description: 'Drop incoming block and checkpoint proposals at the libp2p dispatch layer (for testing only)',
    ...booleanConfigHelper(false),
  },
  skipProposalSlotValidation: {
    description: 'Accept proposal gossip regardless of slot timing (for testing only)',
    ...booleanConfigHelper(false),
  },
  skipCheckpointProposalValidation: {
    description:
      'Skip checkpoint proposal validation and always attest, broadcasting the attestation before processing the embedded last block',
    ...booleanConfigHelper(false),
  },
  minTxPoolAgeMs: {
    env: 'P2P_MIN_TX_POOL_AGE_MS',
    description: 'Minimum age (ms) a transaction must have been in the pool before it is eligible for block building.',
    ...numberConfigHelper(2_000),
  },
  slashDataWithholdingToleranceSlots: {
    env: 'SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS',
    description:
      'L2 slots to wait after a checkpoint slot before declaring its txs missing. Drives both the data-withholding slasher check and the missing-tx collection deadline.',
    ...numberConfigHelper(3),
  },
  p2pMissingTxCollectionDeadlineSlots: {
    env: 'P2P_MISSING_TX_COLLECTION_DEADLINE_SLOTS',
    description:
      'Optional deadline (in L2 slots after the block slot) for collecting missing txs for unproven mined blocks. Clamped up to the data-withholding tolerance window so collection never gives up before the slash verdict.',
    ...optionalNumberConfigHelper(),
  },
  priceBumpPercentage: {
    env: 'P2P_RPC_PRICE_BUMP_PERCENTAGE',
    description:
      'Minimum percentage fee increase required to replace an existing tx via RPC. Even at 0%, replacement still requires paying at least 1 unit more.',
    ...bigintConfigHelper(10n),
  },
  ...pickConfigMappings(sharedSequencerConfigMappings, [
    'expectedBlockProposalsPerSlot',
    'maxTxsPerBlock',
    'checkpointProposalSyncGraceSeconds',
    'maxBlocksPerCheckpoint',
    'blockDurationMs',
  ]),
  ...p2pReqRespConfigMappings,
  ...batchTxRequesterConfigMappings,
  ...chainConfigMappings,
  ...txCollectionConfigMappings,
  ...txFileStoreConfigMappings,
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
  | 'queryForIp'
  | 'publicIpServices'
> &
  Required<Pick<P2PConfig, 'p2pIp' | 'p2pPort'>> &
  Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKb'> &
  Pick<ChainConfig, 'l1ChainId'>;

const bootnodeConfigKeys: (keyof BootnodeConfig)[] = [
  'p2pIp',
  'p2pPort',
  'p2pBroadcastPort',
  'listenAddress',
  'peerIdPrivateKey',
  'peerIdPrivateKeyPath',
  'dataDirectory',
  'dataStoreMapSizeKb',
  'bootstrapNodes',
  'l1ChainId',
  'queryForIp',
  'publicIpServices',
];

export const bootnodeConfigMappings = pickConfigMappings(
  { ...p2pConfigMappings, ...dataConfigMappings, ...chainConfigMappings },
  bootnodeConfigKeys,
);

/**
 * Parses a `+`-separated flags string into validation properties for an allow list entry.
 * Supported flags: `os` (onlySelf), `rn` (rejectNullMsgSender), `cl=N` (calldataLength).
 */
function parseFlags(
  flags: string,
  entry: string,
): { onlySelf?: boolean; rejectNullMsgSender?: boolean; calldataLength?: number } {
  const result: { onlySelf?: boolean; rejectNullMsgSender?: boolean; calldataLength?: number } = {};
  for (const flag of flags.split('+')) {
    if (flag === 'os') {
      result.onlySelf = true;
    } else if (flag === 'rn') {
      result.rejectNullMsgSender = true;
    } else if (flag.startsWith('cl=')) {
      const n = parseInt(flag.slice(3), 10);
      if (isNaN(n) || n < 0) {
        throw new Error(
          `Invalid allow list entry "${entry}": invalid calldataLength in flag "${flag}". Expected a non-negative integer.`,
        );
      }
      result.calldataLength = n;
    } else {
      throw new Error(`Invalid allow list entry "${entry}": unknown flag "${flag}". Supported flags: os, rn, cl=N.`);
    }
  }
  return result;
}

/**
 * Parses a string to a list of allowed elements.
 * Each entry is expected to be of one of the following formats:
 * `I:${address}:${selector}` — instance (contract address) with function selector
 * `C:${classId}:${selector}` — class with function selector
 *
 * An optional flags segment can be appended after the selector:
 * `I:${address}:${selector}:${flags}` or `C:${classId}:${selector}:${flags}`
 * where flags is a `+`-separated list of: `os` (onlySelf), `rn` (rejectNullMsgSender), `cl=N` (calldataLength).
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
    const trimmed = val.trim();
    if (!trimmed) {
      continue;
    }
    const [typeString, identifierString, selectorString, flagsString] = trimmed.split(':');

    if (!selectorString) {
      throw new Error(
        `Invalid allow list entry "${trimmed}": selector is required. Expected format: I:address:selector or C:classId:selector`,
      );
    }

    const selector = FunctionSelector.fromString(selectorString);
    const flags = flagsString ? parseFlags(flagsString, trimmed) : {};

    if (typeString === 'I') {
      entries.push({
        address: AztecAddress.fromString(identifierString),
        selector,
        ...flags,
      });
    } else if (typeString === 'C') {
      entries.push({
        classId: Fr.fromHexString(identifierString),
        selector,
        ...flags,
      });
    } else {
      throw new Error(
        `Invalid allow list entry "${trimmed}": unknown type "${typeString}". Expected "I" (instance) or "C" (class).`,
      );
    }
  }

  return entries;
}
