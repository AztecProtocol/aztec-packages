import type { AztecNodeService } from '@aztec/aztec-node';
import { retryUntil } from '@aztec/aztec.js';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG } from './p2p_network.js';

const NUM_NODES = 4;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 40900;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'validators-sentinel-'));

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_validators_sentinel', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
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
      },
    });

    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('collects stats for offline validator', async () => {
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
    );

    // Wait for a few blocks to be mined
    const currentBlock = t.monitor.l2BlockNumber;
    const blockCount = 3;
    const timeout = SHORTENED_BLOCK_TIME_CONFIG.aztecSlotDuration * blockCount * 8;
    t.logger.info(`Waiting until L2 block ${currentBlock + blockCount}`, { currentBlock, blockCount, timeout });
    await retryUntil(() => t.monitor.l2BlockNumber >= currentBlock + blockCount, 'blocks mined', timeout);

    const stats = await nodes[0].getValidatorsStats();
    t.logger.info(`Collected validator stats at block ${t.monitor.l2BlockNumber}`, { stats, validators: t.validators });

    // Check stats for the offline validator
    const offlineValidator = t.validators.at(-1)!.attester.toLowerCase();
    t.logger.info(`Asserting stats for offline validator ${offlineValidator}`);
    const offlineStats = stats.stats[offlineValidator];
    const historyLength = offlineStats.history.length;
    expect(offlineStats.history.length).toBeGreaterThanOrEqual(blockCount - 1);
    expect(offlineStats.history.every(h => h.status.endsWith('-missed'))).toBeTrue();
    expect(offlineStats.missedAttestations.count + offlineStats.missedProposals.count).toEqual(historyLength);
    expect(offlineStats.missedAttestations.rate).toEqual(1);
    expect(offlineStats.missedProposals.rate).toBeOneOf([1, NaN]);

    // Check stats for a validator that mined a block
    const [proposerValidator, proposerStats] = Object.entries(stats.stats).find(([_, v]) =>
      v?.history?.some(h => h.status === 'block-mined'),
    )!;
    t.logger.info(`Asserting stats for proposer validator ${proposerValidator}`);
    expect(t.validators.map(v => v.attester.toLowerCase())).toContain(proposerValidator);
    expect(proposerStats.history.length).toBeGreaterThanOrEqual(blockCount - 1);
    expect(proposerStats.missedProposals.rate).toBeLessThan(1);

    // Check stats for a validator that attested to a block
    const [attestorValidator, attestorStats] = Object.entries(stats.stats).find(([_, v]) =>
      v?.history?.some(h => h.status === 'attestation-sent'),
    )!;
    t.logger.info(`Asserting stats for attestor validator ${attestorValidator}`);
    expect(t.validators.map(v => v.attester.toLowerCase())).toContain(attestorValidator);
    expect(attestorStats.history.length).toBeGreaterThanOrEqual(blockCount - 1);
    expect(attestorStats.missedAttestations.rate).toBeLessThan(1);
  });
});
