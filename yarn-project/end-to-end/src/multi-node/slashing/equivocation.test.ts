import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  buildMockGossipValidators,
  withOnlyOffense,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 4;

/**
 * E2E test for the equivocation recovery scenario under proposer pipelining.
 *
 * Two conflicting checkpoint proposals are gossiped during the same slot:
 * - Node A (holds all 4 validator keys) publishes the "real" checkpoint to L1
 *   but never broadcasts via gossipsub (`skipBroadcastProposals + skipIncomingProposals`).
 * - The "X" node (B or C, whichever holds the slot proposer's key) broadcasts an
 *   alternative checkpoint that reaches B/C/D via gossipsub but never lands on L1
 *   (`skipPublishingCheckpointsPercent: 100`).
 *
 * The test verifies that L1 sync overrides the gossip-only proposal on all observer
 * nodes (B, C, D) once A's L1-confirmed checkpoint propagates via the archiver.
 *
 * It additionally verifies that the chain heals after node A is stopped, and that every observing
 * validator records a DUPLICATE_PROPOSAL slashing offense.
 *
 * Uses MultiNodeTestContext with mockGossipSubNetwork, no initial sequencer, and slasherEnabled.
 */
describe('multi-node/slashing/equivocation', () => {
  let logger: Logger;
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Creates 4 nodes (A holds all keys, B/C each hold 2, D is an observer). Warps L1 to one slot
  // before the target slot so pipelining engages. Waits for B/C/D to see the gossip-only proposal
  // then for A's L1-confirmed checkpoint to override it on those nodes. Stops A, re-enables
  // publishing on B/C, waits for chain recovery, and asserts DUPLICATE_PROPOSAL offense on B and C.
  it('L1-confirmed checkpoint overrides gossip-only equivocating proposal', async () => {
    // Build 4 validators (V1..V4) using the shared deterministic builder (keys from index 3).
    const validators = buildMockGossipValidators(NODE_COUNT);

    // Timing calculation for 3 blocks per checkpoint with 8s sub-slots:
    // - initializationOffset = 0.5s (test mode, ethereumSlotDuration < 8)
    // - 3 blocks x 8s = 24s
    // - checkpointFinalization = 0.5s (assemble) + 0 (p2p in test) + 2s (L1 publish) = 2.5s
    // - finalBlockDuration = 8s (re-execution)
    // - Total: 0.5 + 24 + 8 + 2.5 = 35s => use 36s
    const slashingUnit = BigInt(1e14);
    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      initialValidators: validators,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: 4,
      // Enable the slasher so we can assert the equivocating proposer is detected for slashing.
      // Round size is aztecEpochDuration * slashingRoundSizeInEpochs = 4 slots; the L1 contract
      // requires QUORUM > ROUND_SIZE / 2, so quorum must be at least 3.
      slasherEnabled: true,
      slashingQuorum: 3,
      slashingRoundSizeInEpochs: 1,
      slashingOffsetInRounds: 1,
      slashAmountSmall: slashingUnit,
      slashAmountMedium: slashingUnit * 2n,
      slashAmountLarge: slashingUnit * 3n,
      slashSelfAllowed: true,
      // Isolate the equivocation offense: only the duplicate-proposal penalty is non-zero.
      ...withOnlyOffense('slashDuplicateProposalPenalty', slashingUnit),
    });

    logger = test.logger;

    // We set different coinbase addresses so different nodes produce different blocks
    const coinbaseA = EthAddress.fromNumber(0xa);
    const coinbaseB = EthAddress.fromNumber(0xb);
    const coinbaseC = EthAddress.fromNumber(0xc);

    // The private keys held by each node:
    // A: all 4 keys → self-attests with all validators, reaches quorum without inbound attestations
    // B: V1 + V2
    // C: V3 + V4
    // D: no validator keys (RPC-only observer)
    const keysA = validators.map(v => v.privateKey as `0x${string}`);
    const keysB = [validators[0].privateKey, validators[1].privateKey] as `0x${string}`[];
    const keysC = [validators[2].privateKey, validators[3].privateKey] as `0x${string}`[];

    // All sequencers start with dontStartSequencer so we can warp the clock first.
    nodes = await asyncMap(
      [
        {
          keys: keysA,
          coinbase: coinbaseA,
          extraOpts: { skipIncomingProposals: true, skipBroadcastProposals: true },
        },
        {
          keys: keysB,
          coinbase: coinbaseB,
          extraOpts: { skipPublishingCheckpointsPercent: 100 },
        },
        {
          keys: keysC,
          coinbase: coinbaseC,
          extraOpts: { skipPublishingCheckpointsPercent: 100 },
        },
      ],
      ({ keys, coinbase, extraOpts }) =>
        test.createValidatorNode(keys, {
          dontStartSequencer: true,
          coinbase,
          buildCheckpointIfEmpty: true,
          minTxsPerBlock: 0,
          ...extraOpts,
        }),
    );

    // Node D: non-validator observer node
    const nodeD = await test.createNonValidatorNode({ buildCheckpointIfEmpty: true, minTxsPerBlock: 0 });
    nodes.push(nodeD);
    const [nodeB, nodeC] = nodes.slice(1);

    logger.warn('All nodes created', { nodes: nodes.length });

    // Determine the next proposer slot by scanning upcoming slots.
    // Since A holds all 4 keys and B/C each hold 2, the slot proposer is always held by A
    // and exactly one of B or C. We identify which one (X) and use its coinbase in assertions.
    const { slot: currentSlot } = test.epochCache.getEpochAndSlotNow();
    // Pick a target slot 2 ahead so there's room for the pipelining build window to engage.
    // With pipelining, the sequencer builds slot (targetSlot+1) while the clock is at targetSlot,
    // so the proposer we care about is for targetSlot+1 (the submission slot).
    const targetSlot = SlotNumber(currentSlot + 2);
    const submissionSlot = SlotNumber(targetSlot + 1);

    const attesterAddresses = validators.map(v => EthAddress.fromString(privateKeyToAccount(v.privateKey).address));
    logger.warn('Validator attester addresses', {
      V1: attesterAddresses[0],
      V2: attesterAddresses[1],
      V3: attesterAddresses[2],
      V4: attesterAddresses[3],
    });
    logger.warn('Validator-to-node assignment', { A: 'V1,V2,V3,V4', B: 'V1,V2', C: 'V3,V4', D: 'none' });

    const proposerAttester = await test.epochCache.getProposerAttesterAddressInSlot(submissionSlot);
    if (!proposerAttester) {
      throw new Error(`No proposer found for slot ${submissionSlot}`);
    }
    logger.warn(`Expected proposer for submission slot`, { submissionSlot, proposerAttester });

    // Warp to one L1 slot before the target L2 slot so pipelining's build window engages.
    const slotStartTimestamp = getTimestampForSlot(targetSlot, test.constants);
    const warpTo = slotStartTimestamp - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping to L1 timestamp ${warpTo} (one L1 slot before L2 slot ${targetSlot})`);
    await test.context.cheatCodes.eth.warp(Number(warpTo), { resetBlockInterval: true });

    // Start all sequencers now that the clock is warped.
    const sequencers = nodes.slice(0, 3).map(n => n.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: ['A', 'B', 'C'][i] }));
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn('All sequencers started');

    // Wait until each of B, C, D sees a proposed block for submissionSlot with coinbase B or C.
    // This confirms the gossip-only equivocating proposal from B or C has propagated.
    // REFACTOR: This is candidate for a "wait until all nodes see a block with these properties" helper in the test context.
    const gossipTimeout = test.L2_SLOT_DURATION_IN_S * 4;
    await Promise.all(
      [nodeB, nodeC, nodeD].map(async (node, idx) => {
        const nodeName = ['B', 'C', 'D'][idx];
        let observedCoinbase: EthAddress | undefined;
        await retryUntil(
          async () => {
            const block = await node.getBlock('proposed');
            if (!block) {
              return false;
            }
            const slot = block.header.globalVariables.slotNumber;
            const cb = block.header.globalVariables.coinbase;
            if (slot === submissionSlot && (cb.equals(coinbaseB) || cb.equals(coinbaseC))) {
              observedCoinbase = cb;
              return true;
            }
            return false;
          },
          `${nodeName} sees gossip-only proposed block for slot ${submissionSlot}`,
          gossipTimeout,
          0.5,
        );
        logger.warn(`Node ${nodeName} observed gossip-only coinbase for slot ${submissionSlot}`, { observedCoinbase });
      }),
    );

    // Now wait until each of B, C, D has a checkpointed block for submissionSlot with coinbaseA.
    // This confirms A's L1-confirmed checkpoint has overridden the gossip-only proposal.
    // REFACTOR: This is candidate for a "wait until all nodes see a block with these properties" helper in the test context.
    const overrideTimeout = test.L2_SLOT_DURATION_IN_S * 4;
    logger.warn(`Waiting for L1-sync override on B, C, D (timeout=${overrideTimeout}s)`);
    await Promise.all(
      [nodeB, nodeC, nodeD].map(async (node, idx) => {
        const nodeName = ['B', 'C', 'D'][idx];
        await retryUntil(
          async () => {
            const block = await node.getBlock('checkpointed');
            if (!block) {
              return false;
            }
            const slot = block.header.globalVariables.slotNumber;
            const cb = block.header.globalVariables.coinbase;
            return slot >= submissionSlot && cb.equals(coinbaseA);
          },
          `${nodeName} checkpointed block for slot ${submissionSlot} with coinbaseA`,
          overrideTimeout,
          0.5,
        );
      }),
    );

    // Assert no spurious failures on B, C.
    // Node A (index 2) generates lots of proposer-rollup-check-failed noise because it has
    // skipIncomingProposals set and can't build a valid checkpoint for slot 2.
    // Nodes B (index 3) and C (index 4) generate checkpoint-publish-failed at the submission slot
    // because skipPublishingCheckpointsPercent: 100 causes their publish to be intentionally skipped.
    const observerFailEvents = failEvents.filter(
      e =>
        e.sequencerIndex !== 2 && // node A
        !(e.type === 'proposer-rollup-check-failed' && e.reason === 'Rollup contract check failed') &&
        !(e.type === 'checkpoint-publish-failed' && e.slot === submissionSlot), // expected skip-publish from B/C
    );
    if (observerFailEvents.length > 0) {
      logger.error('Unexpected fail events on observer sequencers', observerFailEvents);
    }
    expect(observerFailEvents).toEqual([]);

    // Then heal. Stop A, re-enable checkpoint publishing on B and C, expect chain to advance.
    logger.warn('Stopping node A and re-enabling publishing on B and C');
    await tryStop(nodes[0], logger);

    const baseline = test.monitor.checkpointNumber;
    logger.warn(`Checkpoint baseline after equivocation: ${baseline}`);

    await nodes[1].setConfig({ skipPublishingCheckpointsPercent: 0 });
    await nodes[2].setConfig({ skipPublishingCheckpointsPercent: 0 });

    const healTarget = CheckpointNumber(baseline + 2);
    const healTimeout = test.L2_SLOT_DURATION_IN_S * 8;
    logger.warn(`Waiting for checkpoint ${healTarget} (timeout=${healTimeout}s)`);
    await test.waitUntilCheckpointNumber(healTarget, healTimeout);

    expect(test.monitor.checkpointNumber).toBeGreaterThanOrEqual(healTarget);
    logger.warn(`Network healed: checkpoint ${test.monitor.checkpointNumber}`);

    // REFACTOR: This is candidate for a "wait until all nodes sync to a chain tip with these properties" helper in the test context.
    await Promise.all(
      [nodeB, nodeC, nodeD].map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            return tips.checkpointed.checkpoint.number >= healTarget;
          },
          `${'BCD'[idx]} synced to checkpoint ${healTarget}`,
          healTimeout,
          0.5,
        ),
      ),
    );

    // Every observing validator should have recorded the equivocation offense. A has been stopped
    // above and D is a non-validator (no slasher), so we poll only B and C.
    logger.warn(`Waiting for DUPLICATE_PROPOSAL offense on every observing node`, {
      proposerAttester,
      submissionSlot,
    });
    const matchesOffense = (o: { offenseType: OffenseType; validator: { toString(): string }; epochOrSlot: bigint }) =>
      o.offenseType === OffenseType.DUPLICATE_PROPOSAL &&
      o.validator.toString() === proposerAttester.toString() &&
      o.epochOrSlot === BigInt(submissionSlot);
    await retryUntil(
      async () => {
        const found = await Promise.all(
          [nodeB, nodeC].map(async n => (await n.getSlashOffenses('all')).some(matchesOffense)),
        );
        return found.every(Boolean);
      },
      `DUPLICATE_PROPOSAL offense on every observing node`,
      test.L2_SLOT_DURATION_IN_S * 4,
      0.5,
    );
  });
});
