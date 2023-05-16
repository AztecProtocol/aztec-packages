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

  /**
   * The tcp port on which the P2P service should listen for connections.
   */
  tcpListenPort: number;

  /**
   * An optional peer id. If blank, will generate a randdom key.
   */
  peerId?: string;

  /**
   * A list of bootstrap peers to connect to.
   */
  bootstrapNodes: string[];

  /**
   * Protocol identifier for transaction gossiping.
   */
  transactionProtocol: string;

  /**
   * Optional hostname/ip address to on which to listen for new connections.
   */
  hostname?: string;
}

/**
 * Gets the config values for p2p client from environment variables.
 * @returns The config values for p2p client.
 */
export function getP2PConfigEnvVars(): P2PConfig {
  const { P2P_CHECK_INTERVAL, P2P_L2_BLOCK_QUEUE_SIZE, P2P_TCP_LISTEN_PORT, PEER_ID, BOOTSTRAP_NODES, P2P_HOSTNAME } =
    process.env;
  const envVars: P2PConfig = {
    checkInterval: P2P_CHECK_INTERVAL ? +P2P_CHECK_INTERVAL : 100,
    l2QueueSize: P2P_L2_BLOCK_QUEUE_SIZE ? +P2P_L2_BLOCK_QUEUE_SIZE : 1000,
    tcpListenPort: P2P_TCP_LISTEN_PORT ? +P2P_TCP_LISTEN_PORT : 0,
    peerId: PEER_ID,
    bootstrapNodes: BOOTSTRAP_NODES ? BOOTSTRAP_NODES.split(',') : [],
    transactionProtocol: '',
    hostname: P2P_HOSTNAME,
  };
  return envVars;
}
