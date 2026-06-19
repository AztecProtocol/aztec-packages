import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type L2Block, L2BlockSourceEvents, type L2Tips } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { MultiNodeTestContext } from './multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 4;

/**
 * E2E test for the orphan-proposed-block prune path under proposer pipelining.
 *
 * With pipelining, the proposer for slot N+1 builds and gossips its checkpoint during slot N. The last block in that
 * checkpoint is broadcast standalone (so peers can pre-sync the archive) and the enclosing CheckpointProposal is
 * broadcast separately. If the CheckpointProposal never arrives, peers are left with a proposed-but-uncheckpointed tip
 * — an "orphan" block — and the next proposer must NOT attempt to build on it.
 *
 * Setup: 4 validators (V1..V4), one node per key, mocked gossip network. We find two consecutive slots S1, S2 with
 * distinct proposers P1, P2. P1 is configured via the test-only `skipBroadcastCheckpointProposal` flag to suppress its
 * CheckpointProposal broadcast while still letting the held last block reach peers. P2 must (a) prune the orphan on
 * every archiver, and (b) build a fresh checkpoint for S2 that lands on L1.
 *
 * MultiNodeTestContext with 4 validator nodes, mockGossipSubNetwork, no prover. Timing: ethSlot=6s,
 * aztecSlot=36s, epoch=4, proofSubmissionEpochs=1024, blockDurationMs=8000, inboxLag=2 (v5 always
 * enforces the timetable, so the former enforceTimeTable/disableAnvilTestWatcher overrides are gone).
 * L1 is time-warped to align with the target S1 build slot.
 */
describe('multi-node/orphan_block_prune', () => {
  let logger: Logger;
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Finds two consecutive slots S1/S2 with distinct proposers. Suppresses P1's CheckpointProposal
  // broadcast, waits for the orphan block to appear on all archivers, asserts L2PruneUncheckpointed
  // fires on every node for slot S1, then verifies the rebuilt S2 checkpoint lands on L1 with a
  // different archive root from the orphan.
  it('all nodes prune the orphan block and S2 rebuilds the checkpoint chain', async () => {
    // Build 4 distinct validators (V1..V4). One key per node, no overlap.
    const validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await MultiNodeTestContext.setup({
      numberOfAccounts: 1,
      initialValidators: validators,
      inboxLag: 2,
      mockGossipSubNetwork: true,
      startProverNode: false,
      aztecEpochDuration: 4,
      aztecProofSubmissionEpochs: 1024,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: NODE_COUNT,
      skipInitialSequencer: true,
    });

    ({ logger } = test);

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

    // Find S1 (>=4 ahead) such that proposers for S1 and S2=S1+1 are two distinct validators. The +4 margin gives the
    // warp+sequencer-start path enough headroom to reach the build window for S1-1 (the pipelining build slot for S1)
    // even if node creation jitters.
    //
    // The L1 rollup contract only exposes proposers for epochs whose randao seed is "stable" (i.e. queryable on L1
    // right now). When we look too far into the future the contract reverts with `ValidatorSelection__EpochNotStable`.
    // We handle this by warping L1 forward one epoch at a time and retrying.
    // REFACTOR: hand-rolled slot-search loop with per-epoch warp and EpochNotStable retry; a DSL
    // helper like findConsecutiveSlotsWithDistinctProposers(minAhead, maxAttempts) would encapsulate
    // the epoch-stable query, warp cadence, and candidate-advance logic.
    let S1: SlotNumber | undefined;
    let proposerOne: EthAddress | undefined;
    let proposerTwo: EthAddress | undefined;
    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts && S1 === undefined; attempt++) {
      try {
        const [p1, p2] = await Promise.all([
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 1)),
        ]);
        const p1Index = p1 ? validators.findIndex(v => v.attester.equals(p1)) : -1;
        const p2Index = p2 ? validators.findIndex(v => v.attester.equals(p2)) : -1;
        if (p1 && p2 && !p1.equals(p2) && p1Index >= 0 && p2Index >= 0) {
          S1 = SlotNumber(candidate);
          proposerOne = p1;
          proposerTwo = p2;
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
    if (S1 === undefined || !proposerOne || !proposerTwo) {
      throw new Error(`Could not find a slot with two distinct consecutive proposers after ${maxAttempts} attempts`);
    }

    const S2 = SlotNumber(S1 + 1);
    const p1Index = validators.findIndex(v => v.attester.equals(proposerOne!));
    const p2Index = validators.findIndex(v => v.attester.equals(proposerTwo!));

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
    const targetTs = getTimestampForSlot(buildSlot, test.constants) - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping L1 to timestamp ${targetTs} (one L1 block before build slot ${buildSlot} for S1=${S1})`);
    await test.context.cheatCodes.eth.warp(Number(targetTs), { resetBlockInterval: true });

    expect(await nodes[0].getBlockNumber()).toEqual(0);

    const sequencers = nodes.map(n => n.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: `V${i + 1}` }));

    await Promise.all(sequencers.map(s => s.start()));
    logger.warn('All sequencers started');

    const slotAdvanceTimeout = test.L2_SLOT_DURATION_IN_S * 3;

    // (1) Orphan appears on every archiver. During build slot S1-1, P1 builds and broadcasts the held last block
    // standalone (because of skipBroadcastCheckpointProposal). Every node's proposed tip advances to a block whose
    // slotNumber === S1.
    logger.warn(`Waiting for proposed chain to reach slot ${S1} on all nodes (orphan tip from P1)`);
    // REFACTOR: Promise.all over per-node retryUntil polling getChainTips; a waitForAllNodesToReach
    // helper that takes a predicate over chain tips would avoid this hand-rolled fan-out pattern.
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            if (tips.proposed.number === 0) {
              return false;
            }
            const block = await node.getBlock(tips.proposed.number);
            return !!block && block.header.globalVariables.slotNumber === S1;
          },
          `node ${idx} proposed advanced to slot ${S1}`,
          slotAdvanceTimeout,
          0.5,
        ),
      ),
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
