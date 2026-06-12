// docs:start:config
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/config';
import { createPXE } from '@aztec/pxe/client/lazy';


export type NetworkType = 'local' | 'remote';

export function getNodeUrl(network: NetworkType): string {
  if (network === 'local') {
    return process.env.AZTEC_NODE_URL || 'http://localhost:8080';
  }
  // For remote networks, the wallet extension manages the node connection
  return process.env.AZTEC_NODE_URL || 'http://localhost:8080';
}

/**
 * Creates an in-browser PXE instance connected to an Aztec node.
 * PXE (Private eXecution Environment) runs locally and handles
 * private state, note discovery, and transaction creation.
 */
export async function createLocalPXE(nodeUrl: string) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const config = getPXEConfig();
  const isLocal = nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
  config.proverEnabled = !isLocal;
  const pxe = await createPXE(aztecNode, config, {});
  console.log('PXE connected to node at:', nodeUrl);

  return { pxe, aztecNode };
}
// docs:end:config
