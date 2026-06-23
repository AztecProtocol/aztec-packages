import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';

import { waitForTxs } from '../../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import { type MbpsFixture, jest, setupMbps, waitForProvenCheckpoint } from './setup.js';

describe('multi-node/consensus/mbps/deploy_and_call', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Pre-proves a high-priority deploy tx and a low-priority call tx for the same contract. Waits
  // until just before the next L2 slot boundary, sends deploy first (then call after 1s), and
  // waits for both to be checkpointed. Asserts deploy block < call block and both belong to the
  // same checkpoint. Waits for that checkpoint to be proven.
  it('deploys a contract and calls it in separate blocks within a slot', async () => {
    fixture = await setupMbps({
      syncChainTip: 'checkpointed',
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    });
    const { test, context, logger, nodes, wallet, from } = fixture;

    // Prepare deploy tx for a new TestContract. Get the instance address so we can construct the call tx.
    const highPriority = new GasFees(100, 100);
    const lowPriority = new GasFees(1, 1);

    const deployMethod = TestContract.deploy(wallet, { deployer: from });
    const deployInstance = await deployMethod.getInstance();
    logger.warn(`Will deploy TestContract at ${deployInstance.address}`);

    // Register the contract on the PXE so we can prove the call interaction against it.
    await wallet.registerContract(deployInstance, TestContract.artifact);
    const deployedContract = TestContract.at(deployInstance.address, wallet);

    // Pre-prove both txs before starting sequencers. This ensures both arrive in the pool
    // at the same time, so the sequencer can sort by priority fee for correct ordering.
    logger.warn(`Pre-proving deploy tx (high priority) and call tx (low priority)`);
    const deployTx = await proveInteraction(wallet, deployMethod, {
      from,
      fee: { gasSettings: { maxPriorityFeesPerGas: highPriority } },
    });
    const callTx = await proveInteraction(wallet, deployedContract.methods.emit_nullifier_public(new Fr(42)), {
      from,
      fee: { gasSettings: { maxPriorityFeesPerGas: lowPriority } },
    });
    logger.warn(`Pre-proved both txs`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Wait until one L1 slot before the start of the next L2 slot.
    // This ensures both txs land in the pending pool right before the proposer starts building.
    // REFACTOR: manual slot-timing arithmetic and waitUntilL1Timestamp call; replace with a helper
    // such as test.waitUntilBuildWindowForNextSlot() that encapsulates this pattern.
    // REFACTOR: This should go into a shared "waitUntilNextSlotStartsBuilding" utility
    const currentL1Block = await test.l1Client.getBlock({ blockTag: 'latest' });
    const currentTimestamp = currentL1Block.timestamp;
    const currentSlot = getSlotAtTimestamp(currentTimestamp, test.constants);
    const nextSlot = SlotNumber(currentSlot + 1);
    const nextSlotTimestamp = getTimestampForSlot(nextSlot, test.constants);
    const targetTimestamp = nextSlotTimestamp - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Waiting until L1 timestamp ${targetTimestamp} (one L1 slot before L2 slot ${nextSlot})`, {
      currentTimestamp,
      currentSlot,
      nextSlot,
      nextSlotTimestamp,
      targetTimestamp,
    });
    await waitUntilL1Timestamp(test.l1Client, targetTimestamp, undefined, test.L2_SLOT_DURATION_IN_S * 3);

    // Send the deploy tx first and give it time to propagate to all validators,
    // then send the call tx. Priority fees are a safety net, but arrival ordering
    // ensures the deploy tx is in the pool before the call tx regardless of gossip timing.
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    logger.warn(`Sending deploy tx first, then call tx`);
    const deployTxHash = await deployTx.send({ wait: NO_WAIT });
    await sleep(1000);
    const callTxHash = await callTx.send({ wait: NO_WAIT });
    const [deployReceipt, callReceipt] = await executeTimeout(
      () => waitForTxs(context.aztecNode, [deployTxHash, callTxHash], { timeout }),
      timeout * 1000,
    );
    logger.warn(`Both txs checkpointed`, {
      deployBlock: deployReceipt.blockNumber,
      callBlock: callReceipt.blockNumber,
    });

    // Both txs should succeed (send throws on revert). Deploy should be in an earlier block.
    expect(deployReceipt.blockNumber).toBeLessThan(callReceipt.blockNumber!);

    // Verify both blocks belong to the same checkpoint.
    const deployCheckpointedBlock = await retryUntil(
      async () =>
        (
          await context.aztecNode.getBlocks(deployReceipt.blockNumber!, 1, {
            includeL1PublishInfo: true,
            includeAttestations: true,
            onlyCheckpointed: true,
          })
        )[0],
      'deploy checkpointed block',
      timeout,
    );
    const callCheckpointedBlock = await retryUntil(
      async () =>
        (
          await context.aztecNode.getBlocks(callReceipt.blockNumber!, 1, {
            includeL1PublishInfo: true,
            includeAttestations: true,
            onlyCheckpointed: true,
          })
        )[0],
      'call checkpointed block',
      timeout,
    );
    expect(deployCheckpointedBlock.checkpointNumber).toBe(callCheckpointedBlock.checkpointNumber);
    logger.warn(`Both blocks in checkpoint ${deployCheckpointedBlock.checkpointNumber}`);

    // Wait for the checkpoint to be proven.
    await waitForProvenCheckpoint(fixture, deployCheckpointedBlock.checkpointNumber);
  });
});
