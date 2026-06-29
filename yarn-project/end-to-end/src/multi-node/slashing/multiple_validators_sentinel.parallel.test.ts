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
const ETHEREUM_SLOT_DURATION = 8;
const AZTEC_SLOT_DURATION = 36;

jest.setTimeout(1000 * 60 * 10);

// Regression test for the sentinel correctly tracking attestations for multiple validators co-hosted on
// the same physical node as the proposer. Uses MultiNodeTestContext on the mock-gossip bus: 2 nodes each
// carrying 3 validator keys (6 validators total) plus a non-validator sentinel node and a fake prover.
// ethSlot=8s, aztecSlot=36s, epoch=2, proofSubEpochs=1024, sentinelEnabled. Each it runs as an isolated
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
      blockDurationMs: 6000,
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

  // Waits past the pipelining warm-up period, then observes SLOT_COUNT slots and asserts that every
  // validator on every node has zero attestation-missed entries in the sentinel history for those slots.
  it('collects attestations for all validators on a node', async () => {
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
  });

  // Stops the second validator node mid-run so it can no longer build blocks. Finds a slot where one
  // of the first node's validators is the proposer, then queries sentinel stats from the sentinel node
  // and asserts: first-node validators have no missed entries for that slot; offline validators have
  // missed entries; and at least one first-node validator has a checkpoint-mined or checkpoint-valid
  // entry confirming the block was proposed.
  it('collects attestations for validators in proposer node when block is not published', async () => {
    await waitForPostWarmupCheckpoint('stopping a validator node and establishing initial slot');

    // Stop the second node, this means the first node won't be able to propose since won't achieve quorum
    await tryStop(nodes[1]);

    await test.monitor.run();
    const { checkpointNumber: initialBlock, l2SlotNumber: initialSlot } = test.monitor;

    const timeout = AZTEC_SLOT_DURATION * SLOT_COUNT * 4;
    const targetSlot = Number(initialSlot) + SLOT_COUNT;
    const firstNodeValidators = test.validators.slice(0, VALIDATORS_PER_NODE).map(v => v.attester);
    const offlineValidators = test.validators.slice(VALIDATORS_PER_NODE, VALIDATORS_PER_NODE * 2).map(v => v.attester);

    test.logger.info(
      `Waiting until L2 slot ${targetSlot} and proposer is in first node (${firstNodeValidators.join(', ')})`,
      { initialBlock, initialSlot, timeout, firstNodeValidators },
    );

    // We want to wait until we see a slot where we query the proposer and find it's one of the first node validators
    let slotForSentinel!: SlotNumber;
    await retryUntil(
      async () => {
        slotForSentinel = (await test.monitor.run()).l2SlotNumber;
        const timestamp = await rollup.getTimestampForSlot(slotForSentinel);
        const proposerAtTime = await rollup.getProposerAt(timestamp);
        test.logger.info(`At slot ${slotForSentinel}, proposer is ${proposerAtTime}`);
        return firstNodeValidators.some(v => v.equals(proposerAtTime)) && slotForSentinel >= targetSlot;
      },
      'proposer is first node',
      timeout,
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
