import { EthAddress } from '@aztec/circuits.js';

/**
 * P2P client configuration values.
 */
export interface P2PConfig {
  /**
   * The frequency in which to check.
   */
  checkInterval: number;

  /**
   * Size of queue of L2 blocks to store.
   */
  l2QueueSize: number;

  rollupContractAddress: EthAddress;

  tcpListenPort: number;

  peerId?: string;

  bootstrapNodes: string[];
}

/**
 * Gets the config values for p2p client from environment variables.
 * @returns The config values for p2p client.
 */
export function getP2PConfigEnvVars(): P2PConfig {
  const {
    P2P_CHECK_INTERVAL,
    P2P_L2_BLOCK_QUEUE_SIZE,
    ROLLUP_CONTRACT_ADDRESS,
    TCP_LISTEN_PORT,
    PEER_ID,
    BOOTSTRAP_NODES,
  } = process.env;
  const envVars: P2PConfig = {
    checkInterval: P2P_CHECK_INTERVAL ? +P2P_CHECK_INTERVAL : 100,
    l2QueueSize: P2P_L2_BLOCK_QUEUE_SIZE ? +P2P_L2_BLOCK_QUEUE_SIZE : 1000,
    rollupContractAddress: ROLLUP_CONTRACT_ADDRESS ? EthAddress.fromString(ROLLUP_CONTRACT_ADDRESS) : EthAddress.ZERO,
    tcpListenPort: TCP_LISTEN_PORT ? +TCP_LISTEN_PORT : 0,
    peerId: PEER_ID,
    bootstrapNodes: BOOTSTRAP_NODES ? BOOTSTRAP_NODES.split(',') : [],
  };
  return envVars;
}
