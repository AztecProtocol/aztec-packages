import { MemoryP2PCLient } from './memory_p2p_client.js';

/**
 * Main function of P2P in-memory client that runs at init.
 */
function main() {
  const p2pClient = new MemoryP2PCLient();
  p2pClient.start();
}

main();
