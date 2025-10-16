import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for an Aztec node to become available by repeatedly attempting to connect.
 * Useful for ensuring a node is ready before performing operations.
 *
 * @param node - The AztecNode instance to connect to.
 * @param logger - Optional logger for verbose output during connection attempts.
 * @returns A promise that resolves when the node is successfully contacted.
 */
export const waitForNode = async (node: AztecNode, logger?: Logger) => {
  await retryUntil(async () => {
    try {
      logger?.verbose('Attempting to contact Aztec node...');
      await node.getNodeInfo();
      logger?.verbose('Contacted Aztec node');
      return true;
    } catch {
      logger?.verbose('Failed to contact Aztec Node');
    }
    return undefined;
  }, 'RPC Get Node Info');
};

export { createAztecNodeClient, type AztecNode } from '@aztec/stdlib/interfaces/client';
