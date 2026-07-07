import type { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { retryUntil } from '@aztec/foundation/retry';

/**
 * Waits until the archiver has seen the L1 to L2 message and indexed it. Unlike
 * {@link waitForL1ToL2MessageReady} from `@aztec/aztec.js/messaging`, this does not
 * require the L2 chain to have advanced to the message's checkpoint — it only confirms
 * the message has been picked up from L1. Use this in tests that explicitly produce L2
 * blocks afterwards to make the message consumable.
 */
export function waitForL1ToL2MessageSeen(
  node: Pick<AztecNode, 'getL1ToL2MessageCheckpoint'>,
  l1ToL2MessageHash: Fr,
  opts: { timeoutSeconds: number },
) {
  return retryUntil(
    async () => (await node.getL1ToL2MessageCheckpoint(l1ToL2MessageHash)) !== undefined,
    `L1 to L2 message ${l1ToL2MessageHash.toString()} seen`,
    opts.timeoutSeconds,
    0.25,
  );
}
