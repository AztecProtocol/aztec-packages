// docs:start:config
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/config';
import { createPXE } from '@aztec/pxe/client/lazy';

// docs:start:network-type
export type NetworkType = 'local' | 'devnet';

export function getNodeUrl(network: NetworkType): string {
  if (network === 'local') {
    return process.env.AZTEC_NODE_URL || 'http://localhost:8080';
  }
  // For devnet, the wallet extension manages the node connection
  return 'https://full-1.devnet.aztec.network';
}
// docs:end:network-type

// docs:start:create-pxe
/**
 * Creates an in-browser PXE instance connected to an Aztec node.
 * PXE (Private eXecution Environment) runs locally and handles
 * private state, note discovery, and transaction creation.
 */
export async function createLocalPXE(nodeUrl: string) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const config = getPXEConfig();
  config.l1Contracts = await aztecNode.getL1ContractAddresses();
  config.proverEnabled = true;
  const pxe = await createPXE(aztecNode, config, {});

  const nodeInfo = await aztecNode.getNodeInfo();
  console.log('PXE connected to node:', nodeInfo);

  return { pxe, aztecNode };
}
// docs:end:create-pxe
// docs:end:config
