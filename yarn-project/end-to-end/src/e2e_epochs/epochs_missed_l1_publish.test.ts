import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type L2Block, L2BlockSourceEvents } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { ChainTips } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

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
 */
describe('e2e_epochs/epochs_missed_l1_publish', () => {
  let logger: Logger;
  let test: EpochsTestContext;
  let nodes: AztecNodeService[];

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('all nodes prune and recover when proposer fails to publish to L1', async () => {
    // Build 4 distinct validators (V1..V4). One key per node, no overlap.
    const validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      inboxLag: 2,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      startProverNode: false,
      aztecEpochDuration: 4,
      aztecProofSubmissionEpochs: 1024,
      enforceTimeTable: true,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: NODE_COUNT,
      skipInitialSequencer: true,
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

    // Find slotOne (>=4 ahead) such that proposers for slotOne, slotTwo, slotThree are three
    // distinct validators. The +4 margin (vs +2 in equivocation) gives the warp+sequencer-start
    // path enough headroom to reach the build window for slotZero even if node creation jitters.
    //
    // The L1 rollup contract only exposes proposers for epochs whose randao seed is "stable"
    // (i.e. queryable on L1 right now). When we look too far into the future the contract
    // reverts with `ValidatorSelection__EpochNotStable`. We handle this by warping L1 forward
    // one epoch at a time and retrying — after each warp the previously-unstable epoch becomes
    // queryable, and we bump the candidate to keep the +4 slot margin from the new "now".
    let slotOne: SlotNumber | undefined;
    let proposerOne: EthAddress | undefined;
    let proposerTwo: EthAddress | undefined;
    let proposerThree: EthAddress | undefined;
    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts && slotOne === undefined; attempt++) {
      try {
        const [p1, p2, p3] = await Promise.all([
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 1)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 2)),
        ]);
        if (p1 && p2 && p3 && !p1.equals(p2) && !p1.equals(p3) && !p2.equals(p3)) {
          slotOne = SlotNumber(candidate);
          proposerOne = p1;
          proposerTwo = p2;
          proposerThree = p3;
          break;
        }
        candidate++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await test.l1Client.getBlock({ includeTransactions: false });
        const warpBy = test.epochDuration * test.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await test.context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(test.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + 4) {
          candidate = newCurrentSlot + 4;
        }
      }
    }
    if (slotOne === undefined || !proposerOne || !proposerTwo || !proposerThree) {
      throw new Error(`Could not find a slot with three distinct consecutive proposers after ${maxAttempts} attempts`);
    }

    const slotZero = SlotNumber(slotOne - 1);
    const slotTwo = SlotNumber(slotOne + 1);
    const slotThree = SlotNumber(slotOne + 2);

    const proposerOneNodeIndex = validators.findIndex(v => v.attester.equals(proposerOne!));
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
    type PruneObservation = { slotNumber: SlotNumber; blocks: L2Block[]; tipsAtPrune: ChainTips };
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

    // Subscribe to the proposerTwo pipelined-discard event — this is the most direct signal
    // that the pipelined slotTwo work was correctly thrown away because parent slotOne did not land.
    const proposerTwoNodeIndex = validators.findIndex(v => v.attester.equals(proposerTwo!));
    const pipelinedDiscardEvents: { slot: SlotNumber; checkpointNumber: number; reason: string }[] = [];
    sequencers[proposerTwoNodeIndex].getSequencer().on('pipelined-checkpoint-discarded', args => {
      pipelinedDiscardEvents.push({ slot: args.slot, checkpointNumber: args.checkpointNumber, reason: args.reason });
      logger.warn(`proposerTwo (node ${proposerTwoNodeIndex}) discarded pipelined work`, args);
    });

    await Promise.all(sequencers.map(s => s.start()));
    logger.warn('All sequencers started');

    const slotAdvanceTimeout = test.L2_SLOT_DURATION_IN_S * 3;

    // (1) During slotZero: the pipelined proposer for slotOne broadcasts. Every node sees a proposed block at slotOne.
    logger.warn(`Waiting for proposed chain to reach slot ${slotOne} on all nodes (build during slotZero)`);
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            if (tips.proposed.number === 0) {
              return false;
            }
            const block = await node.getBlock(tips.proposed.number);
            return !!block && block.header.globalVariables.slotNumber === slotOne;
          },
          `node ${idx} proposed advanced to slot ${slotOne}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
    );

    // (2) During slotOne: the pipelined proposer for slotTwo broadcasts on top of slotOne → proposed reaches slotTwo.
    logger.warn(`Waiting for proposed chain to reach slot ${slotTwo} on all nodes (build during slotOne)`);
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            if (tips.proposed.number === 0) {
              return false;
            }
            const block = await node.getBlock(tips.proposed.number);
            return !!block && block.header.globalVariables.slotNumber === slotTwo;
          },
          `node ${idx} proposed advanced to slot ${slotTwo}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
    );

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
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            if (tips.proposed.number === 0) {
              return false;
            }
            const block = await node.getBlock(tips.proposed.number);
            return !!block && block.header.globalVariables.slotNumber >= slotThree;
          },
          `node ${idx} proposed advanced to slot >= ${slotThree}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
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
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            if (tips.checkpointed.checkpoint.number === 0) {
              return false;
            }
            const block = await node.getBlock(tips.checkpointed.block.number);
            return (
              !!block && block.header.globalVariables.slotNumber >= slotThree && tips.checkpointed.block.number > 0
            );
          },
          `node ${idx} checkpointed advanced to slot >= ${slotThree}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
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
