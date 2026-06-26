import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getEpochAtSlot, getSlotAtTimestamp, getStartTimestampForEpoch } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';

import { waitForTxs } from '../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import {
  type BlockProductionWithProverFixture,
  jest,
  setupBlockProductionWithProver,
  waitForProvenCheckpoint,
} from './setup.js';

// The proven-checkpoint tail (~47% of the body) is a fixed wall-clock wait for the epoch holding the
// deploy+call checkpoint to close on L1: with `aztecProofSubmissionEpochs: 1` the epoch proof can only
// be submitted once the *next* epoch begins, and at the 72s/12s wide-slot cadence that boundary is ~12
// L1 blocks (~143s) of dead interval-mining away. The sequencers are already idle for this stretch
// (`waitForProvenCheckpoint` stops them; we stop them here first so none of them race the jump), so the
// fast-forward only skips empty time. We warp the shared L1 clock (`TestDateProvider` is shared by the
// cheatcodes, the nodes and the prover, so the warp moves everyone's view of L1 time) to one L1 block
// before the start of the proof-submission epoch, then let the existing wait observe the boundary cross
// and the (mock) proof land organically over the remaining real time.
async function warpToProofSubmissionEpoch(fixture: BlockProductionWithProverFixture): Promise<void> {
  const { test, context, logger, nodes } = fixture;

  // Stop the sequencers before warping so none of them tries to propose into the skipped slots and
  // records a sequencer failure (which `waitForProvenCheckpoint` would later flag). Stopping is
  // idempotent, so `waitForProvenCheckpoint` re-stopping them afterwards is harmless.
  await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

  const { slot } = test.epochCache.getEpochAndSlotNow();
  const checkpointEpoch = getEpochAtSlot(slot, test.constants);
  const proofEpoch = EpochNumber(Number(checkpointEpoch) + test.constants.proofSubmissionEpochs);
  const targetTs = getStartTimestampForEpoch(proofEpoch, test.constants) - BigInt(test.L1_BLOCK_TIME_IN_S);
  const currentTs = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());

  if (currentTs < targetTs) {
    logger.warn(
      `Warping L1 from ${currentTs} to ${targetTs} (1 L1 block before proof-submission epoch ${proofEpoch})`,
      {
        checkpointEpoch,
        proofEpoch,
        currentTs,
        targetTs,
      },
    );
    await context.cheatCodes.eth.warp(Number(targetTs), { resetBlockInterval: true });
  }
}

describe('multi-node/block-production/deploy_and_call_ordering', () => {
  let fixture: BlockProductionWithProverFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Pre-proves a high-priority deploy tx and a low-priority call tx for the same contract. Waits
  // until just before the next L2 slot boundary, sends deploy first (then call after 1s), and
  // waits for both to be checkpointed. Asserts deploy block < call block and both belong to the
  // same checkpoint. Waits for that checkpoint to be proven.
  it('deploys a contract and calls it in separate blocks within a slot', async () => {
    fixture = await setupBlockProductionWithProver({
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
    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    // Wait until one L1 slot before the start of the next L2 slot.
    // This ensures both txs land in the pending pool right before the proposer starts building.
    const currentL1Block = await test.l1Client.getBlock({ blockTag: 'latest' });
    const currentSlot = getSlotAtTimestamp(currentL1Block.timestamp, test.constants);
    const nextSlot = SlotNumber(currentSlot + 1);
    await test.waitForBuildWindowForSlot(nextSlot, { timeout: test.L2_SLOT_DURATION_IN_S * 3 });

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

    // Wait for the checkpoint to be proven. Warp past the dead epoch-close gap first: the proof for the
    // checkpoint's epoch is only submittable once the proof-submission epoch begins, and the sequencers
    // are stopped for the wait anyway, so the intervening slots are empty wall-clock time.
    await warpToProofSubmissionEpoch(fixture);
    await waitForProvenCheckpoint(fixture, deployCheckpointedBlock.checkpointNumber);
  });
});
