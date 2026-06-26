import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import type { TestProverNode } from '@aztec/prover-node/test';
import { getEpochAtSlot, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxExecutionResult } from '@aztec/stdlib/tx';

import { expect, jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForNodeCheckpoint } from '../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { FAST_REORG_TIMING, SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

/**
 * E2E tests for optimistic (checkpoint-driven) proving with reorg scenarios.
 *
 * Setup: a single sequencer/validator node from `SingleNodeTestContext.setup` plus the context's fake prover-node (no
 * `mockGossipSubNetwork`, so no gossip bus), making this a `single-node` test on the production `Sequencer`. Each of the
 * six `describe` blocks builds a fresh context in its own `beforeEach` and tears it down in the shared `afterEach`. The
 * happy-path pair uses defaults (`numberOfAccounts: 1`; ethSlot=8s local/12s CI, aztecSlot=16s/24s, epoch=6,
 * proofSubEpochs=1); the five reorg describes use a faster cadence (ethSlot=4s, aztecSlot=36s, epoch=4 — or 8 for the
 * with-replacement case so the replacement lands in-epoch — proofSubEpochs=1000, blockDurationMs=8s, minTxsPerBlock=0,
 * anvilSlotsInAnEpoch=32, maxSpeedUpAttempts=0, cancelTxOnTimeout=false). The `prover-node starts mid-epoch` describe
 * sets `startProverNode: false` and spins up the prover via `test.createProverNode()` partway through the epoch.
 *
 * L1 reorgs are driven by `cheatCodes.eth.reorgWithReplacement` and treated as `other-active L1` per the rubric — NOT
 * cross-chain bridging — so the file stays `single-node` (mirrors `partial-proofs/single_root` and
 * `recovery/sync_after_reorg`).
 * Block production is paused/resumed mid-test via the `skipPublishingCheckpointsPercent` node-admin config, and the
 * `checkpoint reorg during proving` describe gates top-tree proving with the prover's `beforeTopTreeProve` session hook.
 * Anvil runs on interval mining; time advances naturally (the reorgs and `waitUntilNextEpochStarts` do the warping).
 */
describe('single-node/proving/optimistic', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let node: AztecNode;

  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;

  /**
   * Looks up the epoch a given checkpoint sits in by reading its slot from the archiver.
   */
  const epochOfCheckpoint = async (cpNumber: CheckpointNumber, timeoutSeconds = 30): Promise<EpochNumber> => {
    const cp = await retryUntil(
      async () => (await node.getCheckpoints(cpNumber, 1))[0],
      `archiver indexes checkpoint ${cpNumber}`,
      timeoutSeconds,
      0.1,
    );
    return getEpochAtSlot(cp.header.slotNumber, test.constants);
  };

  /** Returns the last block number contained in the given checkpoint. */
  const lastBlockOfCheckpoint = async (cpNumber: CheckpointNumber): Promise<BlockNumber> => {
    const cp = await retryUntil(
      async () => (await node.getCheckpoints(cpNumber, 1))[0],
      `archiver indexes checkpoint ${cpNumber}`,
      30,
      0.1,
    );
    return BlockNumber(cp.startBlock + cp.blockCount - 1);
  };

  /**
   * Returns the canonical checkpoint numbers that fall within `epoch`, considering checkpoints
   * `1..upTo`. Retries until the archiver has indexed the whole range so the count is stable.
   */
  const checkpointsInEpoch = async (epoch: EpochNumber, upTo: CheckpointNumber): Promise<CheckpointNumber[]> => {
    const cps = await retryUntil(
      async () => {
        const all = await node.getCheckpoints(CheckpointNumber(1), Number(upTo));
        return all.length >= Number(upTo) ? all : undefined;
      },
      `archiver indexes checkpoints up to ${upTo}`,
      30,
      0.2,
    );
    return cps.filter(cp => getEpochAtSlot(cp.header.slotNumber, test.constants) === epoch).map(cp => cp.number);
  };

  /**
   * Background sampler proving the prover-node works an epoch *optimistically* — i.e. it
   * spawns a checkpoint's sub-tree before the epoch is over on L1, not just after the
   * last checkpoint lands.
   *
   * The check has to be more than "a session exists for the epoch": full sessions only
   * open once the epoch is complete on L1, and even a non-optimistic prover would start
   * the moment the epoch's last checkpoint is pushed (a few L1 slots before the epoch's
   * final L2 slot). So instead we watch the long-lived `CheckpointStore`: at each tick we
   * record, per epoch, the earliest wall-clock slot at which *some* `CheckpointProver`
   * for that epoch has been registered. Sub-trees are spawned at registration, so this
   * slot is strictly before the epoch's last slot when optimistic proving is active.
   */
  const startMidEpochProvingSampler = (proverNode: TestProverNode) => {
    /** epoch -> earliest wall-clock slot at which a CheckpointProver for that epoch was registered. */
    const provingStartedAtSlot = new Map<EpochNumber, SlotNumber>();
    let stopped = false;
    // REFACTOR: hand-rolled setTimeout sampler loop with a `stopped` flag — a polling/observe helper
    // (e.g. a sampler that records earliest-observed values per key until disposed) should replace it.
    const loop = (async () => {
      while (!stopped) {
        const { epoch, slot } = test.epochCache.getEpochAndSlotNow();
        const hasProverThisEpoch = proverNode
          .getCheckpointStore()
          .listAll()
          .some(p => p.epochNumber === epoch);
        if (hasProverThisEpoch && !provingStartedAtSlot.has(epoch)) {
          provingStartedAtSlot.set(epoch, slot);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();
    return async () => {
      stopped = true;
      await loop;
      return provingStartedAtSlot;
    };
  };

  /** Asserts a CheckpointProver for `epoch` was registered before the epoch's last L2 slot. */
  const expectOptimisticProving = (provingStartedAtSlot: Map<EpochNumber, SlotNumber>, epoch: EpochNumber) => {
    const observedSlot = provingStartedAtSlot.get(epoch);
    const [, lastSlot] = getSlotRangeForEpoch(epoch, test.constants);
    expect(observedSlot).toBeDefined();
    expect(observedSlot!).toBeLessThan(lastSlot);
  };

  afterEach(async () => {
    await test.teardown();
  });

  describe('happy path', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({ numberOfAccounts: 1 });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('proves an epoch via checkpoint-driven flow', async () => {
      const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
      const stopSampler = startMidEpochProvingSampler(proverNode);

      // Land a real tx in the epoch so we prove actual tx effects, not just empty blocks.
      const contract = await test.registerTestContract(context.wallet);
      const provenTx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(1)), {
        from: context.accounts[0],
      });
      const txReceipt = await provenTx.send();
      const txCheckpoint = (await node.getBlock(txReceipt.blockNumber!))!.checkpointNumber;
      const txEpoch = await epochOfCheckpoint(txCheckpoint);
      logger.info(`Tx ${txReceipt.txHash} landed in checkpoint ${txCheckpoint} (epoch ${txEpoch})`);

      logger.info(`Waiting for epoch ${txEpoch} to end`);
      await test.waitUntilEpochStarts(txEpoch + 1);
      const epochEndCheckpointNumber = (await test.monitor.run(true)).checkpointNumber;
      logger.info(`Epoch ${txEpoch} ended with checkpoint number ${epochEndCheckpointNumber}`);
      expect(epochEndCheckpointNumber).toBeGreaterThanOrEqual(txCheckpoint);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpointNumber, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(txCheckpoint);

      await test.waitForNodeToSync(await lastBlockOfCheckpoint(epochEndCheckpointNumber), 'proven');

      // The tx is in a proven block.
      expect((await node.getTxReceipt(txReceipt.txHash)).executionResult).toEqual(TxExecutionResult.SUCCESS);

      // A CheckpointProver for the epoch was registered before the epoch's last slot — i.e.
      // the prover-node started proving optimistically rather than waiting for the epoch to end.
      const provingStartedAtSlot = await stopSampler();
      logger.info(`Optimistic proving start slots by epoch: ${JSON.stringify([...provingStartedAtSlot])}`);
      expectOptimisticProving(provingStartedAtSlot, txEpoch);
    });

    it('proves multiple epochs via checkpoint-driven flow', async () => {
      const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
      const stopSampler = startMidEpochProvingSampler(proverNode);
      const contract = await test.registerTestContract(context.wallet);

      const numEpochs = 4;
      const provenEpochs: EpochNumber[] = [];
      for (let i = 0; i < numEpochs; i++) {
        // Land a real tx (distinct nullifier per iteration) in the current epoch.
        const provenTx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), {
          from: context.accounts[0],
        });
        const txReceipt = await provenTx.send();
        const txCheckpoint = (await node.getBlock(txReceipt.blockNumber!))!.checkpointNumber;
        const txEpoch = await epochOfCheckpoint(txCheckpoint);
        provenEpochs.push(txEpoch);
        logger.info(`Tx ${txReceipt.txHash} landed in checkpoint ${txCheckpoint} (epoch ${txEpoch})`);

        logger.info(`Waiting for epoch ${txEpoch} to end`);
        await test.waitUntilEpochStarts(txEpoch + 1);
        const cp = (await test.monitor.run(true)).checkpointNumber;
        expect(cp).toBeGreaterThanOrEqual(txCheckpoint);

        await test.waitUntilProvenCheckpointNumber(cp, 240);
        expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(txCheckpoint);

        await test.waitForNodeToSync(await lastBlockOfCheckpoint(cp), 'proven');
        expect((await node.getTxReceipt(txReceipt.txHash)).executionResult).toEqual(TxExecutionResult.SUCCESS);
      }

      // Every epoch the prover-node proved should have had a CheckpointProver registered
      // before the epoch's last slot — i.e. proving started mid-epoch, not after.
      const provingStartedAtSlot = await stopSampler();
      logger.info(`Optimistic proving start slots by epoch: ${JSON.stringify([...provingStartedAtSlot])}`);
      for (const epoch of provenEpochs) {
        expectOptimisticProving(provingStartedAtSlot, epoch);
      }
    });
  });

  describe('mid-epoch checkpoint reorg with replacement', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        // Use a longer epoch so the replacement checkpoint has room to land in the same
        // epoch after a reorg. With epochDuration=4 the sequencer's "prepare one slot
        // ahead" pattern, plus any L1-tx slip, pushes the replacement past the epoch
        // boundary (see CI failure on `+2` reorg, replacement landed two slots into the
        // next epoch).
        aztecEpochDuration: 8,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('replaces a reorged checkpoint and proves the epoch', async () => {
      const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;

      // Anchor on a freshly-started epoch so we have enough slots for the replacement
      // to land in the same epoch after the reorg — `waitUntilEpochStarts(1)` would
      // return immediately under CI load and leave us with no slack.
      await test.waitUntilNextEpochStarts();

      // Wait for the 2nd checkpoint within this epoch.
      const initialCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const midCheckpoint = CheckpointNumber(initialCheckpoint + 2);
      await test.waitUntilCheckpointNumber(midCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      const checkpointBeforeReorg = test.monitor.checkpointNumber;
      logger.info(`Reached checkpoint ${checkpointBeforeReorg}`);

      // Capture the epoch of the checkpoint we're about to reorg out — we can't look it
      // up after the reorg removes it from the archiver. The replacement must land in the
      // same epoch for this test to be exercising what it claims.
      const epochBeforeReorg = await epochOfCheckpoint(checkpointBeforeReorg);

      // The prover-node must have started a sub-tree for the checkpoint we're about to
      // reorg out — otherwise this test could pass simply because the prover hadn't begun
      // assembling the checkpoint yet. Capture the prover's slot so we can identify the
      // original after the reorg even if the replacement reuses the same checkpoint number.
      const originalProver = await retryUntil(
        () =>
          Promise.resolve(
            proverNode
              .getCheckpointStore()
              .listAll()
              .find(p => p.checkpoint.number === checkpointBeforeReorg),
          ),
        `prover starts sub-tree for checkpoint ${checkpointBeforeReorg}`,
        30,
        0.2,
      );
      const originalSlot = originalProver.slotNumber;
      logger.info(`Prover started sub-tree for checkpoint ${checkpointBeforeReorg} at slot ${originalSlot}`);

      // Stop block production.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last checkpoint.
      logger.info(`Reorging L1 to remove checkpoint ${checkpointBeforeReorg}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(checkpointBeforeReorg);
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${checkpointBeforeReorg})`);

      // Verify node detects the reorg.
      await waitForNodeCheckpoint(node, afterReorgCheckpoint, {
        compare: (actual, target) => actual <= target,
        timeout: 30,
      });

      // Verify the prover-node observes the prune. `markPruned()` fires reactively when
      // the L2BlockStream emits the prune; the SlotWatcher then reaps the (now pruned)
      // prover on its next tick (default 1s), so checking strictly for `isPruned()` would
      // race against the reap. Identify the original by `(checkpointNumber, slot)` —
      // checkpoint numbers refill sequentially after a reorg, so the replacement reuses
      // the same number but lives at a different slot. Accept either state for the
      // original: still in the store and pruned, or already reaped.
      await retryUntil(
        () => {
          const prover = proverNode
            .getCheckpointStore()
            .listAll()
            .find(p => p.checkpoint.number === checkpointBeforeReorg && p.slotNumber === originalSlot);
          return Promise.resolve(!prover || prover.isPruned());
        },
        `prover marks original checkpoint ${checkpointBeforeReorg} (slot ${originalSlot}) as pruned (or reaps it)`,
        30,
        0.2,
      );

      // Resume block production — sequencer proposes a replacement in the next slot.
      logger.info('Resuming block production for replacement checkpoint');
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 0 });

      // After the L1 reorg, anvil's L1 clock can drift relative to the prior schedule, which
      // sometimes makes the first replacement publish tx timeout and retry in a later slot.
      // Give the wait enough headroom (~half an epoch) for that retry path.
      const replacementCheckpoint = CheckpointNumber(afterReorgCheckpoint + 1);
      await test.waitUntilCheckpointNumber(replacementCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      logger.info(`Replacement checkpoint ${replacementCheckpoint} published`);

      // The replacement must land in the same epoch as the reorged-out checkpoint —
      // otherwise we'd be testing a fresh epoch, not a re-created one (A-1046).
      const currentEpoch = await epochOfCheckpoint(replacementCheckpoint);
      expect(currentEpoch).toEqual(epochBeforeReorg);

      // The prover-node must have a sub-tree for the replacement checkpoint — i.e. it
      // re-created its work for epoch X after the prune (A-1046: checkpoint arrives →
      // removed → new checkpoint for the same epoch → proves with the new one).
      await retryUntil(
        () =>
          Promise.resolve(
            proverNode
              .getCheckpointStore()
              .listAll()
              .some(p => p.checkpoint.number === replacementCheckpoint && !p.isPruned()),
          ),
        `prover re-creates sub-tree for replacement checkpoint ${replacementCheckpoint}`,
        30,
        0.2,
      );

      // Wait for the epoch to end and the replacement to be proven on L1. Block
      // production has been resumed and may produce additional checkpoints before the
      // next epoch starts; we only assert that the chain advanced past the replacement
      // and that the replacement itself ends up proven.
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(epochEndCheckpoint).toBeGreaterThanOrEqual(replacementCheckpoint);

      await test.waitUntilProvenCheckpointNumber(replacementCheckpoint, 240);
      logger.info(`Epoch proven after mid-epoch checkpoint replacement`);
    });
  });

  describe('mid-epoch checkpoint reorg moving a tx', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        numberOfAccounts: 1,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    // A real tx (not just an empty checkpoint) whose checkpoint is reorged out must be
    // remined into a fresh checkpoint and proven there — the tx moves checkpoints across
    // the reorg. (PR #23002 review: "a tx that was mined in a checkpoint is now mined in a
    // different one".)
    it('reorgs a tx out of its checkpoint and proves it after it is remined', async () => {
      const contract = await test.registerTestContract(context.wallet);
      const from = context.accounts[0];

      // Anchor on a freshly-started epoch so the reorg + remine has room to complete
      // before the proof-submission window closes.
      await test.waitUntilNextEpochStarts();

      // Send a tx and wait for it to be mined into a checkpoint.
      const provenTx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(1)), { from });
      const txReceipt = await provenTx.send();
      const originalBlock = (await node.getBlock(txReceipt.blockNumber!))!;
      const originalCheckpoint = originalBlock.checkpointNumber;
      logger.info(`Tx ${txReceipt.txHash} landed in checkpoint ${originalCheckpoint} (block ${txReceipt.blockNumber})`);

      // Reorg L1 deeply enough to drop the L1 block that published the tx's checkpoint.
      const [cp] = await node.getCheckpoints(originalCheckpoint, 1, { includeL1PublishInfo: true });
      if (!cp.l1.published) {
        throw new Error(`Expected checkpoint ${originalCheckpoint} to have L1 publish info`);
      }
      const originalSlot = cp.header.slotNumber;
      const checkpointL1Block = Number(cp.l1.blockNumber);
      const currentL1Block = await context.cheatCodes.eth.blockNumber();
      const reorgDepth = currentL1Block - checkpointL1Block + 1;
      logger.info(`Reorging ${reorgDepth} L1 blocks to remove checkpoint ${originalCheckpoint}`);
      await context.cheatCodes.eth.reorgWithReplacement(reorgDepth);

      // The node detects the prune and drops back below the reorged-out checkpoint.
      await waitForNodeCheckpoint(node, originalCheckpoint, {
        compare: (actual, target) => actual < target,
        timeout: 60,
      });
      logger.info(`Node observed the reorg removing checkpoint ${originalCheckpoint}`);

      // The tx returns to the mempool and is remined into a fresh checkpoint. Poll for a
      // successful receipt whose checkpoint is at or beyond the reorged-out one (not a
      // stale read of the removed block).
      const reminedCheckpoint = await retryUntil(
        async () => {
          const r = await node.getTxReceipt(txReceipt.txHash);
          if (r.executionResult !== TxExecutionResult.SUCCESS || !r.blockNumber) {
            return undefined;
          }
          const block = await node.getBlock(r.blockNumber);
          return block && block.checkpointNumber >= originalCheckpoint ? block.checkpointNumber : undefined;
        },
        'tx remined after reorg',
        120,
        0.5,
      );
      logger.info(`Tx remined into checkpoint ${reminedCheckpoint}`);

      // The remined checkpoint must live at a different slot than the original — otherwise
      // we'd be testing same-slot replacement, not the "tx moves checkpoints across the
      // reorg" path. Checkpoint numbers refill after a reorg, so the number alone could
      // match either case. The remine signal fires on local world-state mining ahead of
      // L1 inclusion, so poll the archiver for the new checkpoint before reading its slot.
      const remined = await retryUntil(
        async () => (await node.getCheckpoints(reminedCheckpoint, 1))[0],
        `archiver indexes remined checkpoint ${reminedCheckpoint}`,
        120,
        0.5,
      );
      expect(remined.header.slotNumber).not.toEqual(originalSlot);
      logger.info(
        `Remined checkpoint ${reminedCheckpoint} is at slot ${remined.header.slotNumber} (original was ${originalSlot})`,
      );

      // Wait for the epoch to end and the remined tx's checkpoint to be proven on L1. The
      // archiver indexes the replacement checkpoint only after the sequencer's slot completes
      // (~slot duration) and the L1 propose tx confirms — far longer than the default 30s.
      const currentEpoch = await epochOfCheckpoint(reminedCheckpoint, 120);
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(epochEndCheckpoint).toBeGreaterThanOrEqual(reminedCheckpoint);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(reminedCheckpoint);
      logger.info(`Remined tx proven in checkpoint ${reminedCheckpoint}`);
    });
  });

  describe('mid-epoch checkpoint reorg without replacement', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('removes a checkpoint mid-epoch via reorg and proves with survivors', async () => {
      // Anchor on a freshly-started epoch so the checkpoints we reorg over (and the survivor)
      // are guaranteed to live in the same epoch. Without this, setup landing near an epoch
      // boundary could leave the survivor in the previous epoch, passing the test without
      // actually exercising in-epoch checkpoint removal (see #22990).
      await test.waitUntilNextEpochStarts();

      // Wait for 2 checkpoints mid-epoch.
      const initialCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const midCheckpoint = CheckpointNumber(initialCheckpoint + 2);
      await test.waitUntilCheckpointNumber(midCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      const checkpointBeforeReorg = test.monitor.checkpointNumber;
      logger.info(`Reached checkpoint ${checkpointBeforeReorg}`);

      // Capture the epoch we're reorging within so we can assert the survivor stays in it.
      const epochBeforeReorg = await epochOfCheckpoint(checkpointBeforeReorg);

      // (1) The epoch must hold multiple checkpoints, with checkpointBeforeReorg as its latest —
      // otherwise removing the last one wouldn't leave any in-epoch survivors to prove with.
      const epochCheckpointsBeforeReorg = await checkpointsInEpoch(epochBeforeReorg, checkpointBeforeReorg);
      expect(epochCheckpointsBeforeReorg.length).toBeGreaterThanOrEqual(2);
      expect(epochCheckpointsBeforeReorg.at(-1)).toEqual(checkpointBeforeReorg);

      // Stop block production so no replacement is proposed.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last checkpoint — before the epoch completes.
      logger.info(`Reorging L1 to remove checkpoint ${checkpointBeforeReorg}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      // (2) The reorg removed exactly the last checkpoint, leaving N-1.
      expect(afterReorgCheckpoint).toEqual(CheckpointNumber(checkpointBeforeReorg - 1));
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${checkpointBeforeReorg})`);

      // Verify node detects the reorg.
      await waitForNodeCheckpoint(node, afterReorgCheckpoint, {
        compare: (actual, target) => actual <= target,
        timeout: 30,
      });

      // The survivor must still be in the epoch we reorged within — otherwise the reorg removed
      // the only in-epoch checkpoint and the test isn't exercising mid-epoch removal.
      const currentEpoch = await epochOfCheckpoint(afterReorgCheckpoint);
      expect(currentEpoch).toEqual(epochBeforeReorg);

      // The epoch now holds exactly N-1 checkpoints — the survivors of the removal.
      const survivingCheckpoints = await checkpointsInEpoch(epochBeforeReorg, afterReorgCheckpoint);
      expect(survivingCheckpoints.length).toEqual(epochCheckpointsBeforeReorg.length - 1);
      expect(survivingCheckpoints.at(-1)).toEqual(afterReorgCheckpoint);

      // Wait for the epoch to end and proof to land with the surviving checkpoints.
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;

      // (3) The epoch proved up to and including the last surviving checkpoint (the (N-1)th).
      expect(epochEndCheckpoint).toEqual(afterReorgCheckpoint);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch proven with surviving checkpoints after mid-epoch reorg`);
    });
  });

  describe('last-slot checkpoint reorg without replacement', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
        // Apply a delay between "epoch complete on L1" and the prover-node hand-off so
        // the reorg below has time to be processed before finalization starts.
        proverNodeConfig: { proverNodeEpochProvingDelayMs: 10_000 },
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('removes the last-slot checkpoint of an epoch via reorg and proves with survivors', async () => {
      // Anchor on a freshly-started epoch so the full slot range is ahead of us.
      const epoch = await test.waitUntilNextEpochStarts();
      const [, epochEndSlot] = getSlotRangeForEpoch(epoch, test.constants);

      // Wait until the wall clock crosses into the last slot of the epoch.
      await retryUntil(
        () => Promise.resolve(test.epochCache.getEpochAndSlotNow().slot >= epochEndSlot),
        `enter slot ${epochEndSlot}`,
        L2_SLOT_DURATION_IN_S * test.epochDuration * 2,
        1,
      );
      logger.info(`Reached last slot ${epochEndSlot} of epoch ${epoch}`);

      // Wait for a checkpoint published in the last slot to actually appear.
      const lastSlotCheckpointNumber = await retryUntil(
        async () => {
          const cpNum = (await test.monitor.run(true)).checkpointNumber;
          if (cpNum === CheckpointNumber.ZERO) {
            return undefined;
          }
          const [cp] = await node.getCheckpoints(cpNum, 1);
          return cp && cp.header.slotNumber === epochEndSlot ? cpNum : undefined;
        },
        'last-slot checkpoint published',
        L2_SLOT_DURATION_IN_S,
        0.5,
      );
      logger.info(`Last-slot checkpoint ${lastSlotCheckpointNumber} published in slot ${epochEndSlot}`);

      // Suppress further publishing so no replacement is proposed.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last-slot checkpoint.
      logger.info(`Reorging L1 to remove last-slot checkpoint ${lastSlotCheckpointNumber}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(lastSlotCheckpointNumber);
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${lastSlotCheckpointNumber})`);

      // The surviving last checkpoint sits in an earlier slot than the epoch's last slot —
      // i.e. the epoch's last block is no longer in the epoch's last slot.
      const [survivor] = await node.getCheckpoints(afterReorgCheckpoint, 1);
      expect(survivor.header.slotNumber).toBeLessThan(epochEndSlot);

      // Verify node detects the reorg.
      await waitForNodeCheckpoint(node, afterReorgCheckpoint, {
        compare: (actual, target) => actual <= target,
        timeout: 30,
      });

      // Wait for the next epoch to start, then for proof to land with the surviving checkpoints.
      await test.waitUntilEpochStarts(epoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(epochEndCheckpoint).toEqual(afterReorgCheckpoint);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch ${epoch} proven with last-slot checkpoint reorged out`);
    });
  });

  describe('checkpoint reorg during proving', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('handles a reorg arriving while the top of the epoch is proving', async () => {
      // Gate top-tree proving so it deterministically blocks until we release it. This
      // gives us a window where the session is mid-proof, and we can fire the reorg
      // precisely during that window. We use the session's `beforeTopTreeProve` hook
      // rather than monkey-patching the orchestrator factory.
      const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
      let releaseProvingGate: () => void = () => {};
      const provingGate = new Promise<void>(resolve => {
        releaseProvingGate = resolve;
      });

      // Capture the session the hook actually gates so the test reorgs the right epoch.
      // The `beforeTopTreeProve` hook takes no session argument, so we identify the calling
      // session by state: `EpochSession.beforeProve` flips the state to `awaiting-root`
      // *before* awaiting this hook (see epoch-session.ts), so the gating session is the
      // live full session sitting in `awaiting-root`. Matching on `awaiting-checkpoints`
      // never fires — that state is already gone by the time the hook runs.
      let gatedSession: ReturnType<TestProverNode['sessionManager']['allSessions']>[number] | undefined;
      // Only gate sessions with at least 2 checkpoints — reorging the last checkpoint
      // of a single-checkpoint epoch leaves nothing to prove, the session is cancelled
      // without replacement, and the test's "wait for fewer checkpoints" check never
      // converges. Sessions with one checkpoint just pass through.
      const findGateableSession = () =>
        proverNode.sessionManager
          .allSessions()
          .find(s => s.getKind() === 'full' && s.getState() === 'awaiting-root' && s.getCheckpoints().length >= 2);
      proverNode.setSessionHooks({
        beforeTopTreeProve: async () => {
          const session = findGateableSession();
          if (!session) {
            return;
          }
          // First gateable session to hit the gate is the one we reorg; later recreated
          // sessions (over the surviving prefix) also reach this hook but the gate is
          // already resolved by then, so they sail through after release.
          gatedSession ??= session;
          logger.warn('Top-tree proving gated — waiting for test to release', { epoch: session.getEpochNumber() });
          await provingGate;
          logger.warn('Proving gate released', { epoch: session.getEpochNumber() });
        },
      });

      // Wait for a gateable session (>= 2 checkpoints) to actually block at the gate. The
      // session manager opens one full session at a time, starting with the lowest unproven
      // epoch; small epochs pass through (see hook above) and we keep proving until a
      // gateable epoch lands and parks itself on `provingGate`. The hook records the session
      // the moment it blocks, so polling `gatedSession` tells us the gate is engaged.
      const inFlightSession = await retryUntil(
        () => Promise.resolve(gatedSession),
        'gateable session blocks at proving gate',
        L2_SLOT_DURATION_IN_S * 12,
        0.5,
      );
      const gatedEpoch = inFlightSession.getEpochNumber();
      logger.info(`Session for epoch ${gatedEpoch} is blocked inside proving — firing reorg now`);

      // The gated session's own checkpoint list gives us the last checkpoint of the gated
      // epoch — we'll reorg that checkpoint out and verify the prover recovers with the
      // surviving prefix. We take the session's own list rather than `monitor.checkpointNumber`
      // because the global high may sit in a later epoch.
      const trackedBeforeReorg = inFlightSession.getCheckpoints().length;
      const epochEndCheckpoint = inFlightSession.getCheckpoints()[trackedBeforeReorg - 1].checkpoint.number;
      logger.info(`Reorging last checkpoint ${epochEndCheckpoint} of gated epoch ${gatedEpoch}`);

      // Stop block production so no replacement comes in.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 deeply enough to actually remove the L1 block in which the last
      // checkpoint of the proving-in-progress epoch was published. L1 may have
      // mined several blocks between the checkpoint publish and now (votes,
      // attestations, slot ticks), so depth=1 is not always sufficient.
      const [cp] = await node.getCheckpoints(epochEndCheckpoint, 1, { includeL1PublishInfo: true });
      if (!cp.l1.published) {
        throw new Error(`Expected checkpoint ${epochEndCheckpoint} to have L1 publish info`);
      }
      const checkpointL1Block = Number(cp.l1.blockNumber);
      const currentL1Block = await context.cheatCodes.eth.blockNumber();
      const reorgDepth = currentL1Block - checkpointL1Block + 1;
      logger.info(
        `Reorging ${reorgDepth} L1 blocks (checkpoint ${epochEndCheckpoint} was published in L1 block ${checkpointL1Block}, current L1 block is ${currentL1Block})`,
      );
      await context.cheatCodes.eth.reorgWithReplacement(reorgDepth);
      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(epochEndCheckpoint);
      logger.info(`Reorg fired: checkpoint ${afterReorgCheckpoint} (was ${epochEndCheckpoint})`);

      // Wait until the prover-node observes the prune and removes the reorged-out
      // checkpoint(s) from the in-flight job. This is the prerequisite for the
      // restart-with-survivors path: when we release the gate below, the cancelled
      // top tree throws `TopTreeCancelledError` and the finalize loop rebuilds with
      // the surviving checkpoints. Without this wait we'd race the L2BlockStream
      // poll and risk top tree #1 starting its real prove before cancellation lands.
      await retryUntil(
        () => {
          // After a prune the original session is cancelled and replaced; the new full
          // session for the same epoch sits in `fullSessions` over the surviving prefix.
          const current = proverNode.sessionManager.getFullSession(gatedEpoch);
          return Promise.resolve(!!current && current.getCheckpoints().length < trackedBeforeReorg);
        },
        'prover-node sees the prune and recreates session with fewer provers',
        30,
        0.2,
      );
      const trimmedSession = proverNode.sessionManager.getFullSession(gatedEpoch)!;
      logger.info(
        `Prover-node trimmed in-flight session: ${trackedBeforeReorg} → ${trimmedSession.getCheckpoints().length} tracked checkpoints`,
      );
      expect(trackedBeforeReorg).toBeGreaterThan(trimmedSession.getCheckpoints().length);

      // Release the gate. The cancelled top tree #1 short-circuits with
      // TopTreeCancelledError, the finalize loop restarts with the surviving sub-trees,
      // and a fresh top tree submits a valid proof for checkpoints 1..afterReorgCheckpoint.
      releaseProvingGate();

      // The in-flight epoch should now be proven on L1
      await test.waitUntilProvenCheckpointNumber(afterReorgCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(afterReorgCheckpoint);
      logger.info(`In-flight epoch proven up to surviving checkpoint ${afterReorgCheckpoint}`);
    });
  });

  describe('prover-node starts mid-epoch', () => {
    beforeEach(async () => {
      test = await SingleNodeTestContext.setup({
        ...FAST_REORG_TIMING,
        // Don't start the prover-node automatically — we spin it up mid-epoch in the test.
        startProverNode: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: 1000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('proves the whole epoch when started mid-epoch including pre-spawn checkpoints', async () => {
      // Sanity: no prover-node yet — the test is responsible for starting one.
      expect(test.proverNodes).toHaveLength(0);

      // Anchor on a freshly-started epoch, then wait until at least TWO checkpoints
      // INSIDE that epoch have landed (epochDuration=4 ⇒ epoch covers 4 slots, so two
      // checkpoints puts us mid-epoch rather than at the boundary). These are the
      // pre-spawn checkpoints that exist before the prover-node is constructed — the
      // new-prover-mid-epoch invariant is that the L2BlockStream replay from
      // `computeStartupState`'s starting block surfaces them as `chain-checkpointed`
      // events and the prover-node registers and proves them.
      const epoch = await test.waitUntilNextEpochStarts();
      const preSpawnCheckpoints = await retryUntil(
        async () => {
          const checkpoints = await node.getCheckpointsData({ epoch });
          return checkpoints.length >= 2 ? checkpoints : undefined;
        },
        `at least 2 checkpoints inside epoch ${epoch}`,
        L2_SLOT_DURATION_IN_S * 8,
        0.5,
      );
      const preSpawnCheckpointNumbers = preSpawnCheckpoints.map(c => c.checkpointNumber);
      logger.info(
        `Pre-spawn checkpoints in epoch ${epoch}: ${preSpawnCheckpointNumbers.join(', ')}; starting prover-node now`,
      );

      // Spawn and start the prover-node. computeStartupState resolves a starting block of
      // 1 (nothing proven yet), so the L2BlockStream replays from the genesis tip and the
      // prover-node sees every checkpoint of the anchored epoch — including both
      // pre-spawn ones.
      const proverAztecNode = await test.createProverNode();
      const proverNode = proverAztecNode.getProverNode() as TestProverNode;
      logger.info(`Prover-node started with id ${proverNode.getProverId().toString()}`);

      // Wait for the anchored epoch to end and its proof to land on L1.
      await test.waitUntilEpochStarts(epoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const lastPreSpawn = preSpawnCheckpointNumbers[preSpawnCheckpointNumbers.length - 1];
      expect(epochEndCheckpoint).toBeGreaterThanOrEqual(lastPreSpawn);
      logger.info(`Epoch ${epoch} ended at checkpoint ${epochEndCheckpoint}; waiting for proof`);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);

      // The L1 proof must cover the entire epoch — including every pre-spawn checkpoint
      // that landed before the prover-node existed. L1 rejects partial / out-of-order
      // epoch proofs, so this is the strict "whole epoch proven" assertion.
      const provenCheckpointNumber = await rollup.getProvenCheckpointNumber();
      expect(provenCheckpointNumber).toBeGreaterThanOrEqual(epochEndCheckpoint);
      expect(provenCheckpointNumber).toBeGreaterThanOrEqual(lastPreSpawn);
      logger.info(`Epoch ${epoch} fully proven up to checkpoint ${provenCheckpointNumber}`);

      // Every pre-spawn checkpoint should be in the prover-node's checkpoint store —
      // each one was registered via the L2BlockStream's replay (chain-checkpointed events).
      // The session manager constructs a full session over the canonical content for the
      // anchored epoch when it completes, then proves it; the store retains the provers
      // until expiry.
      const epochCheckpointsInStore = await proverNode.getCheckpointStore().listCanonicalForEpoch(epoch);
      const storedNumbers = new Set(epochCheckpointsInStore.map(p => p.checkpoint.number));
      for (const n of preSpawnCheckpointNumbers) {
        expect(storedNumbers.has(n)).toBe(true);
      }
    });
  });
});
