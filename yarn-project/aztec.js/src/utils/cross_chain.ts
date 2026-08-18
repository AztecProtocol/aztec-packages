import type { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import type { BlockTag } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for the L1 to L2 message to be ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param opts - Options
 */
export function waitForL1ToL2MessageReady(
  node: Pick<AztecNode, 'getBlockData' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** Timeout for the operation in seconds */ timeoutSeconds: number;
    /**
     * Chain tip to evaluate readiness against. Defaults to `'latest'`. Set this to the tip the consuming PXE syncs to
     * (e.g. `'proven'`) so readiness answers whether the message is present at the same block the transaction
     * simulation will anchor to, not at a newer tip.
     */
    chainTip?: BlockTag;
  },
): Promise<boolean> {
  return retryUntil(
    () => isL1ToL2MessageReady(node, l1ToL2MessageHash, opts.chainTip),
    `L1 to L2 message ${l1ToL2MessageHash.toString()} ready`,
    opts.timeoutSeconds,
    1,
  );
}

/**
 * Returns whether the L1 to L2 message is ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param chainTip - Chain tip to evaluate readiness against. Defaults to `'latest'`. Pass the tip the consuming PXE
 * syncs to (e.g. `'proven'`) so readiness is checked at the block the transaction simulation will anchor to.
 * @returns True if the message is ready to be consumed, false otherwise
 */
export async function isL1ToL2MessageReady(
  node: Pick<AztecNode, 'getBlockData' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  chainTip: BlockTag = 'latest',
): Promise<boolean> {
  const messageCheckpointNumber = await node.getL1ToL2MessageCheckpoint(l1ToL2MessageHash);
  if (messageCheckpointNumber === undefined) {
    return false;
  }

  // L1 to L2 messages are included in the first block of a checkpoint
  const block = await node.getBlockData(chainTip);
  return block !== undefined && block.checkpointNumber >= messageCheckpointNumber;
}
