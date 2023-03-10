import { MemoryP2PCLient } from './memory_p2p_client.js';
import { MockRollup, MockRollupSource } from './mocks.js';

/**
 * Main function of P2P in-memory client that runs at init.
 */
function main() {
  // TODO: replace with actual rollup source that gets instantiated with env variables
  const rollupSource = new MockRollupSource();
  const p2pClient = new MemoryP2PCLient(rollupSource);
  p2pClient.start();
}

main();
