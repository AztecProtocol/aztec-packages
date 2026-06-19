import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type L2Block, L2BlockSourceEvents, type L2Tips } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 4;

/**
 * E2E test for the "missed L1 publish" scenario under proposer pipelining.
 *
 * Each of 4 nodes holds exactly one validator key. We pick four consecutive slots
 * (slotZero, slotOne, slotTwo, slotThree) such that the proposers for slotOne, slotTwo, and
 * slotThree are three distinct validators, then warp to one L1 block before slotZero begins.
 * The proposer for slotOne is configured to skip its L1 publish.
 *
 * With pipelining, the proposer for slot N+1 builds and gossips its checkpoint during slot N,
 * then publishes that checkpoint to L1 during slot N+1. So gossip-driven `proposed` chain
 * advances arrive one slot earlier than the L1-driven `checkpointed` advance.
 *
 * Expected behavior:
 *  - During slotZero, the pipelined proposer for slotOne gossips its build → every node's
 *    `proposed` tip advances to a block at slotOne.
 *  - During slotOne, the pipelined proposer for slotTwo gossips on top of the slotOne proposal →
 *    `proposed` advances to a block at slotTwo. Meanwhile the proposer for slotOne attempts L1
 *    publish but is configured to skip it, so no checkpoint lands.
 *  - When slotOne ends with no checkpoint mined, every node's archiver prunes the
 *    uncheckpointed slotOne and slotTwo blocks; we verify rollback via the prune event.
 *    We then re-enable publishing on the formerly suppressed node so recovery can proceed.
 *  - During slotTwo, the pipelined proposer for slotThree builds on top of the (now genesis)
 *    checkpointed tip → `proposed` advances again.
 *  - During slotThree, that pipelined work is published → `checkpointed` finally advances.
 *
 * Uses MultiNodeTestContext with mockGossipSubNetwork, no initial sequencer, and no prover node.
 */
describe('multi-node/prune/missed_l1_publish', () => {
  let logger: Logger;
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Searches for slotOne..slotThree with three distinct proposers (warp on EpochNotStable). Sets
  // skipPublishingCheckpointsPercent=100 on proposerOne's node. Warps L1 to slotZero-1 L1 block.
  // Subscribes to prune events on all nodes. Starts all sequencers and verifies: proposed tip
  // reaches slotOne then slotTwo; all nodes emit L2PruneUncheckpointed at slotOne end; recovery
  // produces a checkpointed block at slotThree. Sanity-checks no unexpected fail events.
  it('all nodes prune and recover when proposer fails to publish to L1', async () => {
    // Build 4 distinct validators (V1..V4). One key per node, no overlap.
    const validators = buildMockGossipValidators(NODE_COUNT);

    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      initialValidators: validators,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: NODE_COUNT,
    });

    logger = test.logger;

    // One node per validator. dontStartSequencer until after the warp so timing is deterministic.
    nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: EthAddress.fromNumber(0xa + i),
        buildCheckpointIfEmpty: true,
        minTxsPerBlock: 0,
      }),
    );

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
    const slotZeroStart = getTimestampForSlot(slotZero, test.constants);
    const warpTo = slotZeroStart - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping L1 to timestamp ${warpTo} (one L1 block before slot ${slotZero})`);
    await test.context.cheatCodes.eth.warp(Number(warpTo), { resetBlockInterval: true });

    // Check that the chain is empty
    const node = nodes[0];
    const blockNumber = await node.getBlockNumber();
    expect(blockNumber).toEqual(0);

    // Start all sequencers.
    const sequencers = nodes.map(n => n.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: `V${i + 1}` }));

    // The proposerTwo pipelined-discard event (the most direct signal that pipelined slotTwo work was
    // thrown away because parent slotOne did not land) is captured by watchSequencerEvents above and
    // tolerated in the final fail-event filter.
    const proposerTwoNodeIndex = validators.findIndex(v => v.attester.equals(proposerTwo));

    await Promise.all(sequencers.map(s => s.start()));
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
});
