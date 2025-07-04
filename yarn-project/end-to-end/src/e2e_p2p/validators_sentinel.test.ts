import type { AztecNodeService } from '@aztec/aztec-node';
import { retryUntil, sleep } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { ValidatorsStats } from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';
import { getContract } from 'viem';

import { createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const NUM_NODES = 4;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 4500;
const BLOCK_COUNT = 3;
const EPOCH_DURATION = 10;
const SLASHING_QUORUM = 3;
const SLASHING_ROUND_SIZE = 5;
const AZTEC_SLOT_DURATION = 12;
const ETHEREUM_SLOT_DURATION = 4;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'validators-sentinel-'));

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_validators_sentinel', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let slashingAmount: bigint;
  let additionalNode: AztecNodeService | undefined;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_validators_sentinel',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      startProverNode: true,
      initialConfig: {
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: EPOCH_DURATION,
        validatorReexecute: false,
        sentinelEnabled: true,
        slashingQuorum: SLASHING_QUORUM,
        slashingRoundSize: SLASHING_ROUND_SIZE,
        slashInactivityCreateTargetPercentage: 0.5,
        slashInactivitySignalTargetPercentage: 0.1,
        slashProposerRoundPollingIntervalSeconds: 1,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

    const { rollup } = await t.getContracts();
    slashingAmount = (await rollup.getDepositAmount()) - (await rollup.getMinimumStake()) + 1n;
    t.ctx.aztecNodeConfig.slashInactivityEnabled = true;
    t.ctx.aztecNodeConfig.slashInactivityCreatePenalty = slashingAmount;
    t.ctx.aztecNodeConfig.slashInactivityMaxPenalty = slashingAmount;

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,

      DATA_DIR,
    );
    await t.removeInitialNode();

    t.logger.info(`Setup complete`, { validators: t.validators });
  });

  afterAll(async () => {
    await t.stopNodes(nodes);
    if (additionalNode !== undefined) {
      await t.stopNodes([additionalNode]);
    }
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  describe('with an offline validator', () => {
    let stats: ValidatorsStats;
    beforeAll(async () => {
      const currentBlock = t.monitor.l2BlockNumber;
      const blockCount = BLOCK_COUNT;
      const timeout = AZTEC_SLOT_DURATION * blockCount * 8;
      const offlineValidator = t.validators.at(-1)!.attester.toString().toLowerCase();

      t.logger.info(`Waiting until L2 block ${currentBlock + blockCount}`, { currentBlock, blockCount, timeout });
      await retryUntil(() => t.monitor.l2BlockNumber >= currentBlock + blockCount, 'blocks mined', timeout);

      t.logger.info(`Shutting down sequencers to ensure at least a block is missed`);
      await Promise.all(nodes.map(node => node.getSequencer()?.updateSequencerConfig({ minTxsPerBlock: 100 })));

      t.logger.info(`Waiting until sentinel processed at least ${blockCount - 1} slots and a missed and a mined block`);
      await retryUntil(
        async () => {
          const { initialSlot, lastProcessedSlot, stats } = await nodes[0].getValidatorsStats();
          t.logger.verbose(`Testing validator stats`, { initialSlot, lastProcessedSlot, stats });
          return (
            initialSlot &&
            lastProcessedSlot &&
            lastProcessedSlot - initialSlot >= blockCount - 1 &&
            Object.values(stats).some(stat => stat.history.some(h => h.status === 'block-mined')) &&
            Object.values(stats).some(stat => stat.history.some(h => h.status === 'block-missed')) &&
            stats[offlineValidator] &&
            stats[offlineValidator].history.length > 0
          );
        },
        'sentinel processed blocks',
        AZTEC_SLOT_DURATION * 8,
        1,
      );

      stats = await nodes[0].getValidatorsStats();
      t.logger.info(`Collected validator stats at block ${t.monitor.l2BlockNumber}`, { stats });
    });

    it('collects stats on offline validator', () => {
      const offlineValidator = t.validators.at(-1)!.attester.toString().toLowerCase();
      t.logger.info(`Asserting stats for offline validator ${offlineValidator}`);
      const offlineStats = stats.stats[offlineValidator];
      const historyLength = offlineStats.history.length;
      expect(offlineStats.history.length).toBeGreaterThan(0);
      expect(offlineStats.history.every(h => h.status.endsWith('-missed'))).toBeTrue();
      expect(offlineStats.missedAttestations.count + offlineStats.missedProposals.count).toEqual(historyLength);
      expect(offlineStats.missedAttestations.rate).toEqual(1);
      expect(offlineStats.missedProposals.rate).toBeOneOf([1, NaN, undefined]);
    });

    it('collects stats on a block builder', () => {
      const [proposerValidator, proposerStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'block-mined'),
      )!;
      t.logger.info(`Asserting stats for proposer validator ${proposerValidator}`);
      expect(proposerStats).toBeDefined();
      expect(t.validators.map(v => v.attester.toString().toLowerCase())).toContain(proposerValidator);
      expect(proposerStats.history.length).toBeGreaterThanOrEqual(1);
      expect(proposerStats.missedProposals.rate).toBeLessThan(1);
    });

    it('collects stats on an attestor', () => {
      const [attestorValidator, attestorStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'attestation-sent'),
      )!;
      t.logger.info(`Asserting stats for attestor validator ${attestorValidator}`);
      expect(attestorStats).toBeDefined();
      expect(t.validators.map(v => v.attester.toString().toLowerCase())).toContain(attestorValidator);
      expect(attestorStats.history.length).toBeGreaterThanOrEqual(1);
      expect(attestorStats.missedAttestations.rate).toBeLessThan(1);
    });

    // Regression test for #13142
    it('starts a sentinel on a fresh node', async () => {
      const l2BlockNumber = t.monitor.l2BlockNumber;
      const nodeIndex = NUM_NODES + 1;
      const newNode = await createNode(
        t.ctx.aztecNodeConfig,
        t.ctx.dateProvider,
        BOOT_NODE_UDP_PORT + nodeIndex + 1,
        t.bootstrapNodeEnr!,
        nodeIndex,
        t.prefilledPublicData,
        `${DATA_DIR}-i`,
      );

      t.logger.info(`Reenabling block building`);
      await Promise.all(nodes.map(node => node.getSequencer()?.updateSequencerConfig({ minTxsPerBlock: 0 })));

      t.logger.info(`Waiting for a few more blocks to be mined`);
      const timeout = AZTEC_SLOT_DURATION * 4 * 12;
      await retryUntil(() => t.monitor.l2BlockNumber > l2BlockNumber + 3, 'more blocks mined', timeout);
      await sleep(1000);

      t.logger.info(`Waiting for sentinel to collect history`);
      await retryUntil(
        () => newNode.getValidatorsStats().then(s => Object.keys(s.stats).length > 1),
        'sentinel stats',
        AZTEC_SLOT_DURATION * 2,
        1,
      );

      const stats = await newNode.getValidatorsStats();
      t.logger.info(`Collected validator stats from new node at block ${t.monitor.l2BlockNumber}`, { stats });
      const newNodeValidator = t.validators.at(-1)!.attester.toString().toLowerCase();
      expect(stats.stats[newNodeValidator]).toBeDefined();
      expect(stats.stats[newNodeValidator].history.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(stats.stats).length).toBeGreaterThan(1);
    });

    it("tries to slash the validator that didn't sign proven blocks", async () => {
      // turn back on block building
      await Promise.all(nodes.map(node => node.getSequencer()?.updateSequencerConfig({ minTxsPerBlock: 0 })));

      // wait until we're beyond the second epoch
      await retryUntil(
        async () => {
          const tips = await nodes[0].getL2Tips();
          return tips.proven.number > 1;
        },
        'proven blocks',
        EPOCH_DURATION * AZTEC_SLOT_DURATION * 2,
        1,
      );

      const rollupRaw = getContract({
        address: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: t.ctx.deployL1ContractsValues.l1Client,
      });

      const rollup = new RollupContract(
        t.ctx.deployL1ContractsValues.l1Client,
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
      );
      const slashingProposer = await rollup.getSlashingProposer();

      await retryUntil(
        async () => {
          const currentProposer = await rollup.getCurrentProposer();
          t.logger.verbose(`Current proposer is ${currentProposer}`);
          const round = await slashingProposer.computeRound(await rollup.getSlotNumber());
          const roundInfo = await slashingProposer.getRoundInfo(rollup.address, round);
          const leaderVotes = await slashingProposer.getProposalVotes(rollup.address, round, roundInfo.leader);
          t.logger.verbose(`Currently in round ${round}`);
          t.logger.verbose(`Leader votes: ${leaderVotes}`);

          const slashEvents = await rollupRaw.getEvents.Slashed();
          return slashEvents.length >= 1;
        },
        'slash event',
        // wait up to 10 full rounds, because we know that 1/5 validators are not voting
        // so give us some time to make sure we get a round that is majority honest
        AZTEC_SLOT_DURATION * SLASHING_ROUND_SIZE * 10,
        1,
      );
      const slashEvents = await rollupRaw.getEvents.Slashed();
      const { attester, amount } = slashEvents[0].args;
      expect(slashEvents.length).toBe(1);
      expect(attester?.toLowerCase()).toBe(t.validators.at(-1)!.attester.toString().toLowerCase());
      expect(amount).toBe(slashingAmount);
    });
  });
});
