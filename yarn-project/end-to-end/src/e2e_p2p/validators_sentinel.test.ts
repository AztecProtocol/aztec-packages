import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, retryUntil, sleep } from '@aztec/aztec.js';
import type { ValidatorsStats } from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const NUM_NODES = 5;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 4500;
const BLOCK_COUNT = 3;
const EPOCH_DURATION = 2;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'validators-sentinel-'));

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_validators_sentinel', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let additionalNode: AztecNodeService | undefined;
  let offlineValidator: EthAddress;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_validators_sentinel',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      startProverNode: true,
      initialConfig: {
        aztecTargetCommitteeSize: NUM_VALIDATORS,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: EPOCH_DURATION,
        slashingRoundSizeInEpochs: 2,
        validatorReexecute: false,
        sentinelEnabled: true,
        slashInactivityPenalty: 0n, // Set to 0 to disable
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

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
      offlineValidator = t.validators.at(-1)!.attester;
      t.logger.warn(`Offline validator is ${offlineValidator}`);

      t.logger.info(`Waiting until L2 block ${currentBlock + blockCount}`, { currentBlock, blockCount, timeout });
      await retryUntil(() => t.monitor.l2BlockNumber >= currentBlock + blockCount, 'blocks mined', timeout);

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
      t.logger.info(`Collected validator stats at block ${t.monitor.l2BlockNumber}`, { stats });
    });

    it('collects stats on offline validator', () => {
      t.logger.info(`Asserting stats for offline validator ${offlineValidator}`);
      const offlineStats = stats.stats[offlineValidator.toString().toLowerCase()];
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
    });
  });
});
