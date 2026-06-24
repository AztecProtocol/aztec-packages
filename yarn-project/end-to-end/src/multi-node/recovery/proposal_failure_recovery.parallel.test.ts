import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type L2Block, L2BlockSourceEvents, type L2Tips } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MV_REORG_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 4;

/**
 * Production-recovery suite under proposer pipelining: a checkpoint proposal fails to land (missed L1
 * publish, or a withheld CheckpointProposal leaving an orphan), every node prunes the uncheckpointed
 * blocks, and the next proposer rebuilds a fresh checkpoint that lands on L1.
 *
 * Both scenarios share the same 4-validator mock-gossip cluster (one key per node, no prover) on the
 * MV reorg cadence (ethSlot=6s, aztecSlot=36s, epoch=4, proofSubmissionEpochs=1024, blockDurationMs=8000,
 * inboxLag=2 — v5 always enforces the timetable). Each test warps L1 to align with its target build slot.
 */
describe('multi-node/recovery/proposal_failure_recovery', () => {
  let logger: Logger;
  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    // Build 4 distinct validators (V1..V4). One key per node, no overlap.
    validators = buildMockGossipValidators(NODE_COUNT);

    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ...MV_REORG_TIMING,
      initialValidators: validators,
      aztecTargetCommitteeSize: NODE_COUNT,
    });

    ({ logger } = test);

    // One node per validator. dontStartSequencer until after the warp so timing is deterministic.
    nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: EthAddress.fromNumber(0xa + i),
        buildCheckpointIfEmpty: true,
        minTxsPerBlock: 0,
      }),
    );

    logger.warn('Validator nodes created', {
      validators: validators.map((v, i) => ({ idx: i, attester: v.attester.toString() })),
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  /**
   * Missed L1 publish: each of 4 nodes holds one validator key. We pick four consecutive slots
   * (slotZero, slotOne, slotTwo, slotThree) such that the proposers for slotOne, slotTwo, and slotThree
   * are three distinct validators, then warp to one L1 block before slotZero begins. The proposer for
   * slotOne is configured to skip its L1 publish.
   *
   * With pipelining, the proposer for slot N+1 builds and gossips its checkpoint during slot N, then
   * publishes that checkpoint to L1 during slot N+1. So gossip-driven `proposed` chain advances arrive
   * one slot earlier than the L1-driven `checkpointed` advance.
   *
   * Expected behavior:
   *  - During slotZero, the pipelined proposer for slotOne gossips its build → every node's `proposed`
   *    tip advances to a block at slotOne.
   *  - During slotOne, the pipelined proposer for slotTwo gossips on top of the slotOne proposal →
   *    `proposed` advances to a block at slotTwo. Meanwhile the proposer for slotOne attempts L1 publish
   *    but is configured to skip it, so no checkpoint lands.
   *  - When slotOne ends with no checkpoint mined, every node's archiver prunes the uncheckpointed
   *    slotOne and slotTwo blocks; we verify rollback via the prune event. We then re-enable publishing
   *    on the formerly suppressed node so recovery can proceed.
   *  - During slotTwo, the pipelined proposer for slotThree builds on top of the (now genesis)
   *    checkpointed tip → `proposed` advances again.
   *  - During slotThree, that pipelined work is published → `checkpointed` finally advances.
   */
  // Searches for slotOne..slotThree with three distinct proposers (warp on EpochNotStable). Sets
  // skipPublishingCheckpointsPercent=100 on proposerOne's node. Warps L1 to slotZero-1 L1 block.
  // Subscribes to prune events on all nodes. Starts all sequencers and verifies: proposed tip
  // reaches slotOne then slotTwo; all nodes emit L2PruneUncheckpointed at slotOne end; recovery
  // produces a checkpointed block at slotThree. Sanity-checks no unexpected fail events.
  it('all nodes prune and recover when proposer fails to publish to L1', async () => {
    const attesterAddresses = validators.map(v => v.attester);
    logger.warn('Validator nodes created', {
      validators: attesterAddresses.map((a, i) => ({ idx: i, attester: a.toString() })),
    });

    // Find slotOne..slotThree (>=4 slots ahead) with three distinct proposers. The +4 margin (vs +2
    // in equivocation) gives the warp+sequencer-start path enough headroom to reach the build window
    // for slotZero even if node creation jitters. findSlotsWithProposers handles the EpochNotStable
    // warp-and-retry: the L1 rollup only exposes proposers for epochs whose randao seed is queryable
    // now, so the helper warps L1 forward one epoch at a time until the candidate epoch is stable.
    const {
      slots: [slotOne, slotTwo, slotThree],
      proposers: [proposerOne, proposerTwo, proposerThree],
    } = await test.findSlotsWithProposers(3, ([p1, p2, p3]) => !p1.equals(p2) && !p1.equals(p3) && !p2.equals(p3));

    const slotZero = SlotNumber(slotOne - 1);

    const proposerOneNodeIndex = validators.findIndex(v => v.attester.equals(proposerOne));
    if (proposerOneNodeIndex < 0) {
      throw new Error(`No node holds the key for proposer ${proposerOne}`);
    }

    logger.warn(`Selected target slotOne=${slotOne}`, {
      slotOne,
      slotZero,
      slotTwo,
      slotThree,
      proposerOne: proposerOne.toString(),
      proposerOneNodeIndex,
      proposerTwo: proposerTwo.toString(),
      proposerThree: proposerThree.toString(),
    });

    // Prevent the proposer for slotOne from publishing the checkpoint to L1 (build & gossip still happen).
    await nodes[proposerOneNodeIndex].setConfig({ skipPublishingCheckpointsPercent: 100 });

    // Subscribe to the prune event on every node before sequencers start, so we never miss it.
    // We capture the L2 tips synchronously inside the handler — the archiver has already removed
    // the pruned blocks at emit time, so this snapshot reflects the rolled-back state before any
    // new pipelined block can be applied.
    type PruneObservation = { slotNumber: SlotNumber; blocks: L2Block[]; tipsAtPrune: L2Tips };
    const prunePromises: Promise<PruneObservation>[] = nodes.map(
      (node, idx) =>
        new Promise<PruneObservation>(resolve => {
          const archiver = node.getBlockSource() as Archiver;
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          archiver.events.once(L2BlockSourceEvents.L2PruneUncheckpointed, async ev => {
            const tipsAtPrune = await node.getChainTips();
            logger.warn(`Node ${idx} pruned uncheckpointed blocks`, {
              slotNumber: ev.slotNumber,
              blocks: ev.blocks.map(b => ({ number: b.number, slot: b.header.globalVariables.slotNumber })),
              tipsAtPrune,
            });
            resolve({ slotNumber: ev.slotNumber, blocks: ev.blocks, tipsAtPrune });
          });
        }),
    );

    // Warp L1 to one L1 block before slotZero begins. Pipelining will then engage during slotZero.
    await test.warpToBuildWindowForSlot(slotZero);

    // Check that the chain is empty
    const node = nodes[0];
    const blockNumber = await node.getBlockNumber();
    expect(blockNumber).toEqual(0);

    // Start all sequencers.
    const { failEvents } = test.watchNodeSequencerEvents(nodes, i => ({ validator: `V${i + 1}` }));

    // The proposerTwo pipelined-discard event (the most direct signal that pipelined slotTwo work was
    // thrown away because parent slotOne did not land) is captured by watchNodeSequencerEvents above and
    // tolerated in the final fail-event filter.
    const proposerTwoNodeIndex = validators.findIndex(v => v.attester.equals(proposerTwo));

    await test.startSequencers(nodes);
    logger.warn('All sequencers started');

    const slotAdvanceTimeout = test.L2_SLOT_DURATION_IN_S * 3;

    // (1) During slotZero: the pipelined proposer for slotOne broadcasts. Every node sees a proposed block at slotOne.
    logger.warn(`Waiting for proposed chain to reach slot ${slotOne} on all nodes (build during slotZero)`);
    await test.waitForAllNodesToReachBlockAtSlot(slotOne, 'proposed', undefined, { timeout: slotAdvanceTimeout });

    // (2) During slotOne: the pipelined proposer for slotTwo broadcasts on top of slotOne → proposed reaches slotTwo.
    logger.warn(`Waiting for proposed chain to reach slot ${slotTwo} on all nodes (build during slotOne)`);
    await test.waitForAllNodesToReachBlockAtSlot(slotTwo, 'proposed', undefined, { timeout: slotAdvanceTimeout });

    // (3) Wait until slotOne has fully ended on L1 — the archiver only prunes once slotAtNextL1Block > slotOne.
    // The end-of-slotOne timestamp equals the start-of-slotTwo timestamp.
    const slotOneEndTimestamp = getTimestampForSlot(slotTwo, test.constants);
    logger.warn(`Waiting until L1 timestamp ${slotOneEndTimestamp} (end of slot ${slotOne})`);
    await waitUntilL1Timestamp(test.l1Client, slotOneEndTimestamp, undefined, test.L2_SLOT_DURATION_IN_S * 3);

    // (4) After slotOne ends without a checkpoint, all nodes should prune.
    // Verify rollback via the prune event itself: the pruned slot must equal slotOne, and the
    // pruned blocks must include the broadcast blocks for slotOne (proposerOne) and slotTwo
    // (pipelined proposerTwo, whose work is now invalid because parent slotOne did not land).
    logger.warn('Waiting for L2PruneUncheckpointed on every node');
    const pruneTimeoutMs = test.L2_SLOT_DURATION_IN_S * 2 * 1000;
    const pruneObservations = await Promise.all(
      prunePromises.map((p, idx) =>
        Promise.race([p, timeoutPromise(pruneTimeoutMs, `Node ${idx} did not emit prune event in time`)]),
      ),
    );

    logger.warn('Asserting prune event details on every node');
    for (const [idx, obs] of pruneObservations.entries()) {
      expect({ idx, slotNumber: obs.slotNumber }).toEqual({ idx, slotNumber: slotOne });
      // proposerOne broadcasts during slotZero, so its block must always be in the pruned set.
      // The pipelined slotTwo broadcast may or may not have arrived in time on every node, so
      // we don't strictly require it here.
      const prunedSlots = obs.blocks.map(b => b.header.globalVariables.slotNumber);
      expect(prunedSlots).toContain(slotOne);
    }

    // (5) Allow the formerly suppressed node to publish again so the chain can recover.
    logger.warn(`Re-enabling checkpoint publishing on node ${proposerOneNodeIndex}`);
    await nodes[proposerOneNodeIndex].setConfig({ skipPublishingCheckpointsPercent: 0 });

    // (6) During slotTwo: the pipelined proposer for slotThree builds and broadcasts → proposed advances again.
    // The chain must have rewound past slotOne and slotTwo and now build on whatever was
    // checkpointed before slotZero — genesis, in this test, since no checkpoints have landed yet.
    const postPruneProposedNumbers = pruneObservations.map(o => o.tipsAtPrune.proposed.number);
    expect(postPruneProposedNumbers[0]).toBe(0);

    logger.warn(`Waiting for proposed chain to advance to slot ${slotThree} on all nodes (build during slotTwo)`);
    await test.waitForAllNodesToReachBlockAtSlot(
      slotThree,
      'proposed',
      block => block.header.globalVariables.slotNumber >= slotThree,
      { timeout: slotAdvanceTimeout },
    );

    // The first block in the chain after the prune must be the slotThree block — there should be
    // nothing between genesis and the new pipelined work, since slotOne and slotTwo were pruned.
    for (const node of nodes) {
      const blocks = await node.getBlocks(BlockNumber(1), 50);
      const firstSlotThreeIdx = blocks.findIndex(b => b.header.globalVariables.slotNumber === slotThree);
      expect(firstSlotThreeIdx).toEqual(0);
    }

    // (7) During slotThree: proposerThree publishes → checkpointed advances on every node.
    logger.warn(`Waiting for checkpointed chain to reach slot >= ${slotThree} on all nodes`);
    await test.waitForAllNodesToReachBlockAtSlot(
      slotThree,
      'checkpointed',
      block => block.header.globalVariables.slotNumber >= slotThree,
      { timeout: slotAdvanceTimeout },
    );

    // Sanity: the only fail events we tolerate are the deliberate skip-publish on the suppressed
    // node for slotOne, the pipelined-discard knock-on from proposerTwo (its parent slotOne
    // never landed), and proposer-rollup-check noise that any non-proposer emits when the rollup
    // contract rejects them.
    const unexpectedFailEvents = failEvents.filter(e => {
      if (
        e.type === 'checkpoint-publish-failed' &&
        e.sequencerIndex === proposerOneNodeIndex + 2 &&
        e.slot === slotOne
      ) {
        return false;
      }
      if (
        e.type === 'checkpoint-publish-failed' &&
        e.sequencerIndex === proposerTwoNodeIndex + 2 &&
        e.slot === slotTwo
      ) {
        return false;
      }
      // Expected
      if (e.type === 'pipelined-checkpoint-discarded') {
        return false;
      }
      return true;
    });
    if (unexpectedFailEvents.length > 0) {
      logger.error('Unexpected fail events from sequencers', unexpectedFailEvents);
    }
    expect(unexpectedFailEvents).toEqual([]);
  });

  /**
   * Orphan-proposed-block prune: with pipelining, the proposer for slot N+1 builds and gossips its
   * checkpoint during slot N. The last block in that checkpoint is broadcast standalone (so peers can
   * pre-sync the archive) and the enclosing CheckpointProposal is broadcast separately. If the
   * CheckpointProposal never arrives, peers are left with a proposed-but-uncheckpointed tip — an
   * "orphan" block — and the next proposer must NOT attempt to build on it.
   *
   * We find two consecutive slots S1, S2 with distinct proposers P1, P2. P1 is configured via the
   * test-only `skipBroadcastCheckpointProposal` flag to suppress its CheckpointProposal broadcast while
   * still letting the held last block reach peers. P2 must (a) prune the orphan on every archiver, and
   * (b) build a fresh checkpoint for S2 that lands on L1. L1 is time-warped to align with the S1 build slot.
   */
  // Finds two consecutive slots S1/S2 with distinct proposers. Suppresses P1's CheckpointProposal
  // broadcast, waits for the orphan block to appear on all archivers, asserts L2PruneUncheckpointed
  // fires on every node for slot S1, then verifies the rebuilt S2 checkpoint lands on L1 with a
  // different archive root from the orphan.
  it('all nodes prune the orphan block and S2 rebuilds the checkpoint chain', async () => {
    // Find S1 (>=4 ahead) such that proposers for S1 and S2=S1+1 are two distinct validators. The +4 margin gives the
    // warp+sequencer-start path enough headroom to reach the build window for S1-1 (the pipelining build slot for S1)
    // even if node creation jitters. The context helper handles the per-epoch warp + EpochNotStable retry.
    const {
      slots: [S1, S2],
      proposers: [proposerOne, proposerTwo],
    } = await test.findSlotsWithProposers(
      2,
      ([p1, p2]) =>
        !p1.equals(p2) && validators.some(v => v.attester.equals(p1)) && validators.some(v => v.attester.equals(p2)),
    );

    const p1Index = validators.findIndex(v => v.attester.equals(proposerOne));
    const p2Index = validators.findIndex(v => v.attester.equals(proposerTwo));

    logger.warn(`Selected target S1=${S1}`, {
      S1,
      S2,
      proposerOne: proposerOne.toString(),
      p1Index,
      proposerTwo: proposerTwo.toString(),
      p2Index,
    });

    // Suppress only the CheckpointProposal broadcast for the proposer of S1. The held last block is still broadcast
    // standalone, so peers' archivers ingest the slot-S1 block as a proposed tip but never see a checkpoint proposal
    // for it — the exact orphan-block state we want.
    await nodes[p1Index].setConfig({ skipBroadcastCheckpointProposal: true });

    // No tx is needed: nodes are configured with buildCheckpointIfEmpty so the proposer will produce an empty
    // checkpoint on its slot. The test verifies the orphan prune + rebuild invariants, not tx flow.

    // Subscribe to the prune event on every node before sequencers start, so we never miss it. We capture the chain
    // tips asynchronously inside the handler for log context, but do not assert on them — by the time the snapshot is
    // read, P2's rebuild may already have landed.
    type PruneObservation = { slotNumber: SlotNumber; blocks: L2Block[]; tipsAtPrune: L2Tips };
    const prunePromises: Promise<PruneObservation>[] = nodes.map(
      (node, idx) =>
        new Promise<PruneObservation>(resolve => {
          const archiver = node.getBlockSource() as Archiver;
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          archiver.events.once(L2BlockSourceEvents.L2PruneUncheckpointed, async ev => {
            const tipsAtPrune = await node.getChainTips();
            logger.warn(`Node ${idx} pruned uncheckpointed blocks`, {
              slotNumber: ev.slotNumber,
              blocks: ev.blocks.map(b => ({ number: b.number, slot: b.header.globalVariables.slotNumber })),
              tipsAtPrune,
            });
            resolve({ slotNumber: ev.slotNumber, blocks: ev.blocks, tipsAtPrune });
          });
        }),
    );

    // Warp L1 to one L1 block before the build slot for S1 (which is S1-1 under pipelining offset 1). Pipelining will
    // then engage during S1-1 and the proposer for S1 builds + would broadcast its CheckpointProposal — except we
    // just suppressed it.
    const buildSlot = SlotNumber(S1 - 1);
    await test.warpToBuildWindowForSlot(buildSlot);

    expect(await nodes[0].getBlockNumber()).toEqual(0);

    const { failEvents } = test.watchNodeSequencerEvents(nodes, i => ({ validator: `V${i + 1}` }));

    await test.startSequencers(nodes);
    logger.warn('All sequencers started');

    const slotAdvanceTimeout = test.L2_SLOT_DURATION_IN_S * 3;

    // (1) Orphan appears on every archiver. During build slot S1-1, P1 builds and broadcasts the held last block
    // standalone (because of skipBroadcastCheckpointProposal). Every node's proposed tip advances to a block whose
    // slotNumber === S1.
    logger.warn(`Waiting for proposed chain to reach slot ${S1} on all nodes (orphan tip from P1)`);
    await test.waitForAllNodesToReachBlockAtSlot(
      S1,
      'proposed',
      block => block.header.globalVariables.slotNumber === S1,
      { timeout: slotAdvanceTimeout, interval: 0.5 },
    );

    // Capture each node's pre-prune block-1 archive root for the staleness check in (3).
    const preBlocks = await Promise.all(nodes.map(node => node.getBlock(BlockNumber(1))));
    const preArchiveRoots = preBlocks.map(block => {
      if (!block) {
        throw new Error('Expected pre-prune block 1 to exist on every node');
      }
      return block.archive.root.toString();
    });
    logger.warn('Captured pre-prune block-1 archive roots', { preArchiveRoots });

    // (2) Orphan is pruned on every archiver. Since no CheckpointProposal was received for S1, the wall-clock prune
    // fires after the checkpoint proposal receive deadline plus local jitter, well inside slot S1 (= the build slot
    // for S2). We wait up to 2 slot durations as a margin.
    logger.warn('Waiting for L2PruneUncheckpointed on every node');
    const pruneTimeoutMs = test.L2_SLOT_DURATION_IN_S * 2 * 1000;
    const pruneObservations = await Promise.all(
      prunePromises.map((p, idx) =>
        Promise.race([p, timeoutPromise(pruneTimeoutMs, `Node ${idx} did not emit prune event in time`)]),
      ),
    );

    for (const [idx, obs] of pruneObservations.entries()) {
      expect({ idx, slotNumber: obs.slotNumber }).toEqual({ idx, slotNumber: S1 });
      const prunedSlots = obs.blocks.map(b => b.header.globalVariables.slotNumber);
      // Only the orphan at slot S1 should have been pruned — nothing earlier or later.
      expect(prunedSlots.every(s => s === S1)).toBe(true);
      // We do not assert exact equality on tipsAtPrune here. The handler is async and awaits getChainTips(), so P2's
      // rebuild could already have landed by the time the snapshot is read. The prune event itself (slotNumber === S1,
      // blocks include S1) is sufficient proof.
    }

    // (3) S2 builds and the checkpoint lands on L1. After the prune, P2's pipelined build during S1 publishes during
    // S2, so L2 block 1 on every node must be the rebuilt block with slot S2. We target block 1 directly rather than
    // the live checkpointed tip to avoid an S3-first race where the chain has already advanced past S2 by the time
    // we poll.
    logger.warn(`Waiting for L2 block 1 to be the rebuilt slot-${S2} block on all nodes`);
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const block = await node.getBlock(BlockNumber(1));
            return !!block && block.header.globalVariables.slotNumber === S2;
          },
          `node ${idx} block 1 rebuilt at slot ${S2}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
    );

    // Independently confirm the checkpoint actually landed on L1 by waiting (bounded) on the chain monitor and
    // verifying the block at L2 block number 1 — that is the rebuilt block, and its slot must equal S2. Targeting
    // block 1 rather than the live tip avoids a race where the chain has already advanced past S2 by the time we read.
    await test.waitUntilCheckpointNumber(CheckpointNumber(1), test.L2_SLOT_DURATION_IN_S * 4);
    const rebuiltBlock = await nodes[0].getBlock(BlockNumber(1));
    expect(rebuiltBlock).toBeDefined();
    expect(rebuiltBlock!.header.globalVariables.slotNumber).toEqual(S2);

    // The rebuilt block at number 1 must have a different archive root from the orphan we saw before the prune. This
    // guards against accidental pass on stale state.
    const postBlocks = await Promise.all(nodes.map(node => node.getBlock(BlockNumber(1))));
    const postArchiveRoots = postBlocks.map(block => {
      if (!block) {
        throw new Error('Expected post-prune block 1 to exist on every node');
      }
      return block.archive.root.toString();
    });
    logger.warn('Captured post-prune block-1 archive roots', { postArchiveRoots });
    for (const [idx, root] of postArchiveRoots.entries()) {
      expect({ idx, root }).not.toEqual({ idx, root: preArchiveRoots[idx] });
    }

    // Tolerated fail events, scoped narrowly: P1 at S1 expectedly fails to publish because peers never see the
    // CheckpointProposal, so it cannot collect attestations. P2 must not discard or miss its own S2 checkpoint.
    const unexpectedFailEvents = failEvents.filter(e => {
      if (e.type === 'checkpoint-publish-failed' && e.sequencerIndex === p1Index + 2 && e.slot === S1) {
        return false;
      }
      return true;
    });
    if (unexpectedFailEvents.length > 0) {
      logger.error('Unexpected fail events from sequencers', unexpectedFailEvents);
    }
    expect(unexpectedFailEvents).toEqual([]);
  });
});
