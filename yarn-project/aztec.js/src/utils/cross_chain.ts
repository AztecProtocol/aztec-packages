import type { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for the L1 to L2 message to be ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param opts - Options
 */
export async function waitForL1ToL2MessageReady(
  node: Pick<AztecNode, 'getCheckpointNumber' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** Timeout for the operation in seconds */ timeoutSeconds: number;
    /** True if the message is meant to be consumed from a public function */ forPublicConsumption: boolean;
  },
) {
  const messageCheckpointNumber = await node.getL1ToL2MessageCheckpoint(l1ToL2MessageHash);
  return retryUntil(
    () => isL1ToL2MessageReady(node, l1ToL2MessageHash, { ...opts, messageCheckpointNumber }),
    `L1 to L2 message ${l1ToL2MessageHash.toString()} ready`,
    opts.timeoutSeconds,
    1,
  );
}

/**
 * Returns whether the L1 to L2 message is ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param opts - Options
 * @returns True if the message is ready to be consumed, false otherwise
 */
export async function isL1ToL2MessageReady(
  node: Pick<AztecNode, 'getCheckpointNumber' | 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** True if the message is meant to be consumed from a public function */ forPublicConsumption: boolean;
    /** Cached synced block number for the message (will be fetched from PXE otherwise) */ messageCheckpointNumber?: number;
  },
): Promise<boolean> {
  const checkpointNumber = await node.getCheckpointNumber();
  const messageCheckpointNumber =
    opts.messageCheckpointNumber ?? (await node.getL1ToL2MessageCheckpoint(l1ToL2MessageHash));
  if (messageCheckpointNumber === undefined) {
    return false;
  }

  // Note that public messages can be consumed 1 checkpointNumber earlier, since the sequencer will include the messages
  // in the L1 to L2 message tree before executing the txs for the block. In private, however, we need to wait
  // until the message is included so we can make use of the membership witness.
  return opts.forPublicConsumption
    ? checkpointNumber + 1 >= messageCheckpointNumber
    : checkpointNumber >= messageCheckpointNumber;
}
