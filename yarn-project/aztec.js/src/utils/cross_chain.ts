import type { Fr } from '@aztec/foundation/fields';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for the L1 to L2 message to be ready to be consumed.
 * @param node - Aztec node instance used to obtain the information about the message
 * @param l1ToL2MessageHash - Hash of the L1 to L2 message
 * @param opts - Options
 */
export async function waitForL1ToL2MessageReady(
  node: Pick<AztecNode, 'getBlockNumber' | 'getL1ToL2MessageBlock'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** Timeout for the operation in seconds */ timeoutSeconds: number;
    /** True if the message is meant to be consumed from a public function */ forPublicConsumption: boolean;
  },
) {
  const messageBlockNumber = await node.getL1ToL2MessageBlock(l1ToL2MessageHash);
  return retryUntil(
    () => isL1ToL2MessageReady(node, l1ToL2MessageHash, { ...opts, messageBlockNumber }),
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
  node: Pick<AztecNode, 'getBlockNumber' | 'getL1ToL2MessageBlock'>,
  l1ToL2MessageHash: Fr,
  opts: {
    /** True if the message is meant to be consumed from a public function */ forPublicConsumption: boolean;
    /** Cached synced block number for the message (will be fetched from PXE otherwise) */ messageBlockNumber?: number;
  },
): Promise<boolean> {
  const blockNumber = await node.getBlockNumber();
  const messageBlockNumber = opts.messageBlockNumber ?? (await node.getL1ToL2MessageBlock(l1ToL2MessageHash));
  if (messageBlockNumber === undefined) {
    return false;
  }

  // Note that public messages can be consumed 1 block earlier, since the sequencer will include the messages
  // in the L1 to L2 message tree before executing the txs for the block. In private, however, we need to wait
  // until the message is included so we can make use of the membership witness.
  return opts.forPublicConsumption ? blockNumber + 1 >= messageBlockNumber : blockNumber >= messageBlockNumber;
}
