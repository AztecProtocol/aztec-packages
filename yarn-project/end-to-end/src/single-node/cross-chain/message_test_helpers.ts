import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

/** Scope from which an L1→L2 message is consumed on L2. */
export type L1ToL2MessageScope = 'private' | 'public';

/** Dependencies the L1→L2 message helpers close over. */
export interface L1ToL2MessageHelperDeps {
  t: CrossChainMessagingTest;
  aztecNode: AztecNode;
  wallet: Wallet;
  user1Address: AztecAddress;
  log: Logger;
  /** Marks the current pending tip proven on L1, subject to the caller's proving policy. */
  markAsProven: () => Promise<void>;
}

/** Helpers for driving L1→L2 messages through the inbox, shared across the L1→L2 messaging suites. */
export interface L1ToL2MessageHelpers {
  sendMessageToL2(message: {
    recipient: AztecAddress;
    content: Fr;
    secretHash: Fr;
  }): ReturnType<typeof sendL1ToL2Message>;
  advanceBlock(): Promise<BlockNumber>;
  waitForMessageFetched(msgHash: Fr): Promise<CheckpointNumber>;
  waitForMessageReady(
    msgHash: Fr,
    scope: L1ToL2MessageScope,
    onNotReady?: (blockNumber: BlockNumber) => Promise<void>,
  ): Promise<void>;
}

/**
 * Builds the L1→L2 message helpers over a running {@link CrossChainMessagingTest}. The `markAsProven`
 * dependency lets each suite plug in its own proving policy: suites that never pause proving pass an
 * unconditional mark, while the inbox-drift suite gates it behind a flag it toggles mid-test.
 */
export function createL1ToL2MessageHelpers(deps: L1ToL2MessageHelperDeps): L1ToL2MessageHelpers {
  const { t, aztecNode, wallet, user1Address, log, markAsProven } = deps;

  // Sends an L1→L2 message from the harness L1 account. This suite skips the token bridge, so the
  // message context is built from the test's L1 handles rather than a CrossChainTestHarness.
  const sendMessageToL2 = (message: { recipient: AztecAddress; content: Fr; secretHash: Fr }) =>
    sendL1ToL2Message(message, {
      l1Client: t.harnessL1Client,
      l1ContractAddresses: t.deployL1ContractsValues.l1ContractAddresses,
    });

  // Sends a tx to L2 to advance the block number by 1
  const advanceBlock = async () => {
    const block = await aztecNode.getBlockNumber();
    log.warn(`Sending noop tx at block ${block}`);
    await wallet.sendTx(ExecutionPayload.empty(), { from: user1Address });
    const newBlock = await aztecNode.getBlockNumber();
    log.warn(`Advanced to block ${newBlock}`);
    if (newBlock === block) {
      throw new Error(`Failed to advance block ${block}`);
    }
    // Keep the proof window from expiring mid-test. No-op once a drift scenario disables proving.
    await markAsProven();
    return newBlock;
  };

  // Waits until the message is fetched by the archiver of the node and returns the msg target checkpoint.
  // Advances a block on each retry because an L1->L2 message is only indexed once further L2 blocks build.
  const waitForMessageFetched = async (msgHash: Fr) => {
    log.warn(`Waiting until the message is fetched by the node`);
    return await retryUntil(
      async () => {
        const checkpoint = await aztecNode.getL1ToL2MessageCheckpoint(msgHash);
        if (checkpoint !== undefined) {
          return checkpoint;
        }
        await advanceBlock();
        return undefined;
      },
      'get msg checkpoint',
      60,
    );
  };

  // Waits until the message is ready to be consumed on L2 as it's been added to the world state
  const waitForMessageReady = async (
    msgHash: Fr,
    scope: L1ToL2MessageScope,
    onNotReady?: (blockNumber: BlockNumber) => Promise<void>,
  ) => {
    const msgCheckpoint = await waitForMessageFetched(msgHash);
    log.warn(
      `Waiting until L2 reaches the first block of msg checkpoint ${msgCheckpoint} (current is ${await aztecNode.getCheckpointNumber()})`,
    );
    await retryUntil(
      async () => {
        const [blockNumber, checkpointNumber] = await Promise.all([
          aztecNode.getBlockNumber(),
          aztecNode.getCheckpointNumber(),
        ]);
        const witness = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
        const isReady = await isL1ToL2MessageReady(aztecNode, msgHash);
        log.info(
          `Block is ${blockNumber}, checkpoint is ${checkpointNumber}. Message checkpoint is ${msgCheckpoint}. Witness ${!!witness}. Ready ${isReady}.`,
        );
        if (!isReady) {
          await (onNotReady ? onNotReady(blockNumber) : advanceBlock());
        }
        return isReady;
      },
      `wait for rollup to reach msg checkpoint ${msgCheckpoint}`,
      240,
    );
  };

  return { sendMessageToL2, advanceBlock, waitForMessageFetched, waitForMessageReady };
}
