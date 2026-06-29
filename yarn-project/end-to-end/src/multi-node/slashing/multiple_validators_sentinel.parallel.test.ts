import type { AztecNodeService } from '@aztec/aztec-node';
import { RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import 'jest-extended';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

const NUM_NODES = 2;
const VALIDATORS_PER_NODE = 3;
const NUM_VALIDATORS = NUM_NODES * VALIDATORS_PER_NODE;
const SLOT_COUNT = 3;
const EPOCH_DURATION = 2;
// The body advances through SLOT_COUNT real L2 slots at wall-clock pace, so the slot duration directly
// sets body time. At eth<8 the sequencer uses the fast (mocked-p2p) operational budgets, which fit a
// checkpoint comfortably in an 8s slot even with six co-hosted validators; larger durations only add
// dead wall-clock without exercising new behavior.
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;

jest.setTimeout(1000 * 60 * 10);

// Regression test for the sentinel correctly tracking attestations for multiple validators co-hosted on
// the same physical node as the proposer. Uses MultiNodeTestContext on the mock-gossip bus: 2 nodes each
// carrying 3 validator keys (6 validators total) plus a non-validator sentinel node and a fake prover.
// ethSlot=4s, aztecSlot=8s, epoch=2, proofSubEpochs=1024, sentinelEnabled. Each it runs as an isolated
// CI job (parallel convention).
describe('multi-node/slashing/multiple_validators_sentinel', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];
  let sentinel: AztecNodeService;
  let rollup: RollupContract;

  beforeAll(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      anvilSlotsInAnEpoch: 4,
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      blockDurationMs: 2000,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      listenAddress: '127.0.0.1',
      minTxsPerBlock: 0,
      aztecEpochDuration: EPOCH_DURATION,
      slashingRoundSizeInEpochs: 2,
      sentinelEnabled: true,
      slashInactivityPenalty: 0n, // Set to 0 to disable
      inboxLag: 2,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    rollup = RollupContract.getFromConfig(test.context.config);

    // Two nodes, each carrying VALIDATORS_PER_NODE consecutive validator keys.
    const keysFor = (nodeIndex: number) =>
      Array.from({ length: VALIDATORS_PER_NODE }, (_, j) => test.privateKeyAt(nodeIndex * VALIDATORS_PER_NODE + j));
    nodes = await Promise.all([0, 1].map(nodeIndex => test.createValidatorNode(keysFor(nodeIndex))));

    sentinel = await test.createNonValidatorNode({ sentinelEnabled: true });

    test.logger.info(`Setup complete`, { validators: test.validators });
  });

  afterAll(async () => {
    await test.teardown();
  });

  const waitForPostWarmupCheckpoint = async (action: string): Promise<void> => {
    await test.monitor.run();
    const warmupSlot = Number(test.monitor.l2SlotNumber) + 1;
    test.logger.info(`Waiting for warmup slot ${warmupSlot} before ${action}`);
    await retryUntil(
      async () => (await test.monitor.run()).l2SlotNumber >= warmupSlot,
      'warmup slot',
      AZTEC_SLOT_DURATION * 3,
    );

    const warmupCheckpoint = test.monitor.checkpointNumber;
    test.logger.info(`Waiting for checkpoint after warmup before ${action}`, { warmupCheckpoint });
    await retryUntil(
      async () => (await test.monitor.run()).checkpointNumber > warmupCheckpoint,
      'post-warmup checkpoint',
      AZTEC_SLOT_DURATION * (SLOT_COUNT + 1) * 3,
    );
  };

  // Two phases share one setup, since each it in a .parallel file re-pays the full beforeAll as its own CI
  // job. Phase 1 runs with both nodes online and asserts every validator on every node has zero
  // attestation-missed entries across the observed slots. Phase 2 then stops the second validator node,
  // finds a slot where a first-node validator is the proposer, and asserts via the sentinel node that
  // first-node validators have no missed entries for that slot, the offline validators do, and at least one
  // first-node validator shows a checkpoint-mined/-valid entry. The phases are ordered (phase 1 needs both
  // nodes online; phase 2 self-anchors on a fresh post-stop slot window).
  it('collects attestations for all validators, including when a block is not published', async () => {
    // --- Phase 1: all validators on a node ---
    // Wait until validator nodes have advanced past their first proposed slot and landed a checkpoint so that the
    // pipelining warm-up period (where some attestations may be missed) is behind us.
    await waitForPostWarmupCheckpoint('establishing initial slot');

    const { checkpointNumber: initialBlock, l2SlotNumber: initialSlot } = test.monitor;

    const timeout = AZTEC_SLOT_DURATION * SLOT_COUNT * 4;
    const targetSlot = Number(initialSlot) + SLOT_COUNT;

    test.logger.info(`Waiting until L2 slot ${targetSlot}`, { initialBlock, initialSlot, timeout });
    await retryUntil(() => test.monitor.l2SlotNumber >= targetSlot, 'slot', timeout);

    test.logger.info(`Waiting until sentinel processed until slot ${targetSlot}`);
    await retryUntil(
      async () => {
        const { lastProcessedSlot } = await nodes[0].getValidatorsStats();
        return lastProcessedSlot !== undefined && lastProcessedSlot >= targetSlot;
      },
      'sentinel processed slots',
      AZTEC_SLOT_DURATION * (SLOT_COUNT + 1) * 3,
    );

    for (const node of [...nodes, sentinel]) {
      const stats = await node.getValidatorsStats();
      test.logger.info(`Collected validator stats at block ${test.monitor.checkpointNumber}`, { stats });

      // Check that all validators have attestations recorded
      for (let i = 0; i < VALIDATORS_PER_NODE * NUM_NODES; i++) {
        const validator = test.validatorAt(i).attester.toString().toLowerCase();
        const validatorStats = stats.stats[validator];
        const history = validatorStats.history.filter(h => h.slot > initialSlot && h.slot <= targetSlot);
        test.logger.info(`Asserting stats for validator ${validator}`, { history });
        expect(history.filter(h => h.status === 'attestation-missed').length).toEqual(0);
      }
    }

    // --- Phase 2: validators in proposer node when block is not published ---
    test.logger.info(`Phase 1 complete; stopping a validator node and establishing a new initial slot`);

    // Stop the second node, this means the first node won't be able to propose since won't achieve quorum
    await tryStop(nodes[1]);

    await test.monitor.run();
    const { checkpointNumber: initialBlock2, l2SlotNumber: initialSlot2 } = test.monitor;

    const timeout2 = AZTEC_SLOT_DURATION * SLOT_COUNT * 4;
    const targetSlot2 = Number(initialSlot2) + SLOT_COUNT;
    const firstNodeValidators = test.validators.slice(0, VALIDATORS_PER_NODE).map(v => v.attester);
    const offlineValidators = test.validators.slice(VALIDATORS_PER_NODE, VALIDATORS_PER_NODE * 2).map(v => v.attester);

    test.logger.info(
      `Waiting until L2 slot ${targetSlot2} and proposer is in first node (${firstNodeValidators.join(', ')})`,
      { initialBlock: initialBlock2, initialSlot: initialSlot2, timeout: timeout2, firstNodeValidators },
    );

    // We want to wait until we see a slot where we query the proposer and find it's one of the first node validators
    let slotForSentinel!: SlotNumber;
    await retryUntil(
      async () => {
        slotForSentinel = (await test.monitor.run()).l2SlotNumber;
        const timestamp = await rollup.getTimestampForSlot(slotForSentinel);
        const proposerAtTime = await rollup.getProposerAt(timestamp);
        test.logger.info(`At slot ${slotForSentinel}, proposer is ${proposerAtTime}`);
        return firstNodeValidators.some(v => v.equals(proposerAtTime)) && slotForSentinel >= targetSlot2;
      },
      'proposer is first node',
      timeout2,
    );

    test.logger.info(`Waiting until sentinel processed until slot ${slotForSentinel}`);
    await retryUntil(
      async () => {
        const { lastProcessedSlot } = await sentinel.getValidatorsStats();
        return lastProcessedSlot !== undefined && lastProcessedSlot >= slotForSentinel;
      },
      `sentinel processed slot ${slotForSentinel}`,
      AZTEC_SLOT_DURATION * (SLOT_COUNT + 1) * 3,
    );

    // Collect stats from the sentinel node
    const stats = await sentinel.getValidatorsStats();
    test.logger.info(`Collected validator stats at slot ${test.monitor.l2SlotNumber}`, { stats });

    const historyForSlot = (validator: (typeof firstNodeValidators)[number]) =>
      stats.stats[validator.toString().toLowerCase()]?.history.filter(h => h.slot === slotForSentinel) ?? [];

    // Check that all of the first node validators have attestations recorded for the selected proposer slot.
    for (const validator of firstNodeValidators) {
      const history = historyForSlot(validator);
      test.logger.info(`Asserting stats for online validator ${validator}`, { history });
      expect(history).not.toBeEmpty();
      expect(
        history.filter(
          h => h.status === 'attestation-missed' || h.status === 'blocks-missed' || h.status === 'checkpoint-missed',
        ),
      ).toBeEmpty();
    }

    // At least one of the first node validators must have been seen as proposer
    const firstNodeBlockProposedHistory = firstNodeValidators
      .flatMap(v => stats.stats[v.toString().toLowerCase()].history)
      .filter(h => h.slot === slotForSentinel)
      .filter(h => h.status === 'checkpoint-valid' || h.status === 'checkpoint-mined');
    expect(firstNodeBlockProposedHistory).not.toBeEmpty();

    // And all of the validators for the offline node must be seen as missed attestation or proposal.
    for (const validator of offlineValidators) {
      const history = historyForSlot(validator);
      test.logger.info(`Asserting stats for offline validator ${validator}`, { history });
      expect(
        history.filter(
          h => h.status === 'attestation-missed' || h.status === 'blocks-missed' || h.status === 'checkpoint-missed',
        ),
      ).not.toBeEmpty();
    }
  });
});
