import type { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for the L1 to L2 message to be ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param opts - Options
 */
export function waitForL1ToL2MessageReady(
  node: Pick<AztecNode, 'getBlock' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** Timeout for the operation in seconds */ timeoutSeconds: number;
  },
) {
  return retryUntil(
    () => isL1ToL2MessageReady(node, l1ToL2MessageHash),
    `L1 to L2 message ${l1ToL2MessageHash.toString()} ready`,
    opts.timeoutSeconds,
    1,
  );
}

/**
 * Returns whether the L1 to L2 message is ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @returns True if the message is ready to be consumed, false otherwise
 */
export async function isL1ToL2MessageReady(
  node: Pick<AztecNode, 'getBlock' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
): Promise<boolean> {
  const messageCheckpointNumber = await node.getL1ToL2MessageCheckpoint(l1ToL2MessageHash);
  if (messageCheckpointNumber === undefined) {
    return false;
  }

  // L1 to L2 messages are included in the first block of a checkpoint
  const latestBlock = await node.getBlock('latest');
  return latestBlock !== undefined && latestBlock.checkpointNumber >= messageCheckpointNumber;
}
