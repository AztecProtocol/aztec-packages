import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { ValidatorsStats } from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import 'jest-extended';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

const NUM_NODES = 5;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BLOCK_COUNT = 3;
const EPOCH_DURATION = 2;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;
const BLOCK_DURATION_MS = 2000;

jest.setTimeout(1000 * 60 * 10);

// Tests sentinel observability: 5 running validators + 1 registered-but-offline validator (6 total),
// fake prover. MultiNodeTestContext on the mock-gossip bus, ethSlot=4s, aztecSlot=8s, epoch=2,
// proofSubEpochs=1024, minTxsPerBlock=0, sentinelEnabled, slashInactivityPenalty=0 (slashing disabled).
// Also regression-tests that a late-joining node initialises its sentinel from the chain state (issue
// #13142).
describe('multi-node/slashing/validators_sentinel', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];
  let additionalNode: AztecNodeService | undefined;
  let offlineValidator: EthAddress;

  beforeAll(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      anvilSlotsInAnEpoch: 4,
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      blockDurationMs: BLOCK_DURATION_MS,
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

    // Create the first NUM_NODES validators' nodes; the last validator shows as offline.
    nodes = await Promise.all(Array.from({ length: NUM_NODES }, (_, i) => test.createValidatorNodeAt(i)));

    test.logger.info(`Setup complete`, { validators: test.validators });
  });

  afterAll(async () => {
    if (additionalNode !== undefined) {
      await additionalNode.stop();
    }
    await test.teardown();
  });

  // Suite that runs with one registered-but-offline validator. The beforeAll waits for the sentinel
  // to accumulate history across BLOCK_COUNT checkpoints, then each it asserts different facets of
  // the collected stats (offline validator, block builder, attestor).
  describe('with an offline validator', () => {
    let stats: ValidatorsStats;
    beforeAll(async () => {
      // Wait until validator nodes have advanced past their first proposed slot so that the
      // pipelining warm-up period (where some attestations may be missed) is behind us.
      await test.monitor.run();
      const warmupSlot = Number(test.monitor.l2SlotNumber) + 1;
      test.logger.info(`Waiting for warmup slot ${warmupSlot} before establishing initial block`);
      await retryUntil(
        async () => (await test.monitor.run()).l2SlotNumber >= warmupSlot,
        'warmup slot',
        AZTEC_SLOT_DURATION * 3,
      );

      const currentBlock = test.monitor.checkpointNumber;
      const blockCount = BLOCK_COUNT;
      const timeout = AZTEC_SLOT_DURATION * blockCount * 8;
      offlineValidator = test.validatorAt(NUM_VALIDATORS - 1).attester;
      test.logger.warn(`Offline validator is ${offlineValidator}`);

      test.logger.info(`Waiting until L2 block ${currentBlock + blockCount}`, { currentBlock, blockCount, timeout });
      await retryUntil(() => test.monitor.checkpointNumber >= currentBlock + blockCount, 'blocks mined', timeout);

      test.logger.info(
        `Waiting until sentinel processed at least ${blockCount - 1} slots and a missed and a mined block`,
      );
      await retryUntil(
        async () => {
          const { initialSlot, lastProcessedSlot, stats } = await nodes[0].getValidatorsStats();
          test.logger.verbose(`Testing validator stats`, { initialSlot, lastProcessedSlot, stats });
          return (
            initialSlot &&
            lastProcessedSlot &&
            lastProcessedSlot - initialSlot >= blockCount - 1 &&
            Object.values(stats).some(stat => stat.history.some(h => h.status === 'checkpoint-mined')) &&
            Object.values(stats).some(stat => stat.history.some(h => h.status === 'attestation-sent')) &&
            stats[offlineValidator.toString().toLowerCase()] &&
            stats[offlineValidator.toString().toLowerCase()].history.length > 0 &&
            stats[offlineValidator.toString().toLowerCase()].history.some(h => h.status === 'attestation-missed')
          );
        },
        'sentinel processed blocks',
        AZTEC_SLOT_DURATION * 16,
        1,
      );

      stats = await nodes[0].getValidatorsStats();
      test.logger.info(`Collected validator stats at block ${test.monitor.checkpointNumber}`, { stats });
    });

    // Asserts the offline validator's entire sentinel history consists only of missed entries and that
    // missedAttestations.rate == 1.
    it('collects stats on offline validator', () => {
      test.logger.info(`Asserting stats for offline validator ${offlineValidator}`);
      const offlineStats = stats.stats[offlineValidator.toString().toLowerCase()];
      const historyLength = offlineStats.history.length;
      expect(offlineStats.history.length).toBeGreaterThan(0);
      expect(offlineStats.history.every(h => h.status.endsWith('-missed'))).toBeTrue();
      expect(offlineStats.missedAttestations.count + offlineStats.missedProposals.count).toEqual(historyLength);
      expect(offlineStats.missedAttestations.rate).toEqual(1);
      expect(offlineStats.missedProposals.rate).toBeOneOf([1, NaN, undefined]);
    });

    // Finds a validator with a checkpoint-mined history entry and asserts its missedProposals.rate < 1.
    it('collects stats on a block builder', () => {
      const [proposerValidator, proposerStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'checkpoint-mined'),
      )!;
      test.logger.info(`Asserting stats for proposer validator ${proposerValidator}`);
      expect(proposerStats).toBeDefined();
      expect(test.validators.map(v => v.attester.toString().toLowerCase())).toContain(proposerValidator);
      expect(proposerStats.history.length).toBeGreaterThanOrEqual(1);
      expect(proposerStats.missedProposals.rate).toBeLessThan(1);
    });

    // Finds a validator with an attestation-sent history entry and asserts its missedAttestations.rate < 1.
    it('collects stats on an attestor', () => {
      const [attestorValidator, attestorStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'attestation-sent'),
      )!;
      test.logger.info(`Asserting stats for attestor validator ${attestorValidator}`);
      expect(attestorStats).toBeDefined();
      expect(test.validators.map(v => v.attester.toString().toLowerCase())).toContain(attestorValidator);
      expect(attestorStats.history.length).toBeGreaterThanOrEqual(1);
      expect(attestorStats.missedAttestations.rate).toBeLessThan(1);
    });

    // Regression test for #13142: a fresh node that joins after several blocks should initialise its
    // sentinel from chain state and accumulate history across subsequent slots.
    it('starts a sentinel on a fresh node', async () => {
      const checkpointNumber = test.monitor.checkpointNumber;
      additionalNode = await test.createNonValidatorNode({ sentinelEnabled: true });

      test.logger.info(`Waiting for a few more blocks to be mined`);
      const timeout = AZTEC_SLOT_DURATION * 4 * 12;
      await retryUntil(() => test.monitor.checkpointNumber > checkpointNumber + 3, 'more blocks mined', timeout);
      await sleep(1000);

      test.logger.info(`Waiting for sentinel to collect history`);
      await retryUntil(
        () => additionalNode!.getValidatorsStats().then(s => Object.keys(s.stats).length > 1),
        'sentinel stats',
        AZTEC_SLOT_DURATION * 2,
        1,
      );

      const stats = await additionalNode!.getValidatorsStats();
      test.logger.info(`Collected validator stats from new node at block ${test.monitor.checkpointNumber}`, { stats });
    });
  });
});
