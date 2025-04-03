import type { AztecNodeService } from '@aztec/aztec-node';
import { retryUntil, sleep } from '@aztec/aztec.js';
import type { ValidatorsStats } from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG } from './p2p_network.js';

const NUM_NODES = 4;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 40900;
const BLOCK_COUNT = 3;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'validators-sentinel-'));

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_validators_sentinel', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network',
      numberOfNodes: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG,
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: 48,
        validatorReexecute: false,
        sentinelEnabled: true,
      },
    });

    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();

    t.logger.info(`Setup complete`, { validators: t.validators });
  });

  afterAll(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  describe('with an offline validator', () => {
    let stats: ValidatorsStats;
    beforeAll(async () => {
      t.logger.info('Creating nodes');
      nodes = await createNodes(
        t.ctx.aztecNodeConfig,
        t.ctx.dateProvider,
        t.bootstrapNodeEnr,
        NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
        BOOT_NODE_UDP_PORT,
        t.prefilledPublicData,
        DATA_DIR,
      );

      const currentBlock = t.monitor.l2BlockNumber;
      const blockCount = BLOCK_COUNT;
      const timeout = SHORTENED_BLOCK_TIME_CONFIG.aztecSlotDuration * blockCount * 8;
      t.logger.info(`Waiting until L2 block ${currentBlock + blockCount}`, { currentBlock, blockCount, timeout });
      await retryUntil(() => t.monitor.l2BlockNumber >= currentBlock + blockCount, 'blocks mined', timeout);

      stats = await nodes[0].getValidatorsStats();
      t.logger.info(`Collected validator stats at block ${t.monitor.l2BlockNumber}`, { stats });
    });

    it('collects stats on offline validator', () => {
      const offlineValidator = t.validators.at(-1)!.attester.toLowerCase();
      t.logger.info(`Asserting stats for offline validator ${offlineValidator}`);
      const offlineStats = stats.stats[offlineValidator];
      const historyLength = offlineStats.history.length;
      expect(offlineStats.history.length).toBeGreaterThanOrEqual(BLOCK_COUNT - 1);
      expect(offlineStats.history.every(h => h.status.endsWith('-missed'))).toBeTrue();
      expect(offlineStats.missedAttestations.count + offlineStats.missedProposals.count).toEqual(historyLength);
      expect(offlineStats.missedAttestations.rate).toEqual(1);
      expect(offlineStats.missedProposals.rate).toBeOneOf([1, NaN]);
    });

    it('collects stats on a block builder', () => {
      const [proposerValidator, proposerStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'block-mined'),
      )!;
      t.logger.info(`Asserting stats for proposer validator ${proposerValidator}`);
      expect(proposerStats).toBeDefined();
      expect(t.validators.map(v => v.attester.toLowerCase())).toContain(proposerValidator);
      expect(proposerStats.history.length).toBeGreaterThanOrEqual(BLOCK_COUNT - 1);
      expect(proposerStats.missedProposals.rate).toBeLessThan(1);
    });

    it('collects stats on an attestor', () => {
      const [attestorValidator, attestorStats] = Object.entries(stats.stats).find(([_, v]) =>
        v?.history?.some(h => h.status === 'attestation-sent'),
      )!;
      t.logger.info(`Asserting stats for attestor validator ${attestorValidator}`);
      expect(attestorStats).toBeDefined();
      expect(t.validators.map(v => v.attester.toLowerCase())).toContain(attestorValidator);
      expect(attestorStats.history.length).toBeGreaterThanOrEqual(BLOCK_COUNT - 1);
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
      const timeout = SHORTENED_BLOCK_TIME_CONFIG.aztecSlotDuration * 4 * 8;
      await retryUntil(() => t.monitor.l2BlockNumber > l2BlockNumber + 3, 'more blocks mined', timeout);
      await sleep(1000);

      const stats = await newNode.getValidatorsStats();
      t.logger.info(`Collected validator stats from new node at block ${t.monitor.l2BlockNumber}`, { stats });
      const newNodeValidator = t.validators.at(-1)!.attester.toLowerCase();
      expect(stats.stats[newNodeValidator]).toBeDefined();
      expect(stats.stats[newNodeValidator].history.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(stats.stats).length).toBeGreaterThan(1);
    });
  });
});
