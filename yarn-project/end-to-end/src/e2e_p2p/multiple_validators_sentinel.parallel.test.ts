import type { AztecNodeService } from '@aztec/aztec-node';
import { RollupContract } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNodes, createNonValidatorNode } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const NUM_NODES = 2;
const VALIDATORS_PER_NODE = 3;
const NUM_VALIDATORS = NUM_NODES * VALIDATORS_PER_NODE;
const BOOT_NODE_UDP_PORT = 4500;
const SLOT_COUNT = 3;
const EPOCH_DURATION = 2;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'validators-sentinel-'));

jest.setTimeout(1000 * 60 * 10);

// Regression test for sentinel properly detecting attestations of validators
// running on the same node as the proposer who pushed a given block.
// REFACTOR: This test shares much code with `validators_sentinel` so we may be able to refactor common parts out.
describe('e2e_p2p_multiple_validators_sentinel', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let sentinel: AztecNodeService;
  let rollup: RollupContract;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_multiple_validators_sentinel',
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

    rollup = RollupContract.getFromConfig(t.ctx.aztecNodeConfig);

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      undefined, // no metrics port
      0, // index offset
      VALIDATORS_PER_NODE, // validators per node
    );

    sentinel = await createNonValidatorNode(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      BOOT_NODE_UDP_PORT + 1 + NUM_NODES,
      t.bootstrapNodeEnr,
      t.prefilledPublicData,
      `${DATA_DIR}-sentinel`,
      undefined,
    );

    await t.removeInitialNode();

    t.logger.info(`Setup complete`, { validators: t.validators });
  });

  afterAll(async () => {
    await t.stopNodes([...nodes, sentinel]);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('collects attestations for all validators on a node', async () => {
    await t.monitor.run();
    const { l2BlockNumber: initialBlock, l2SlotNumber: initialSlot } = t.monitor;

    const timeout = AZTEC_SLOT_DURATION * SLOT_COUNT * 4;
    const targetSlot = Number(initialSlot) + SLOT_COUNT;

    t.logger.info(`Waiting until L2 slot ${targetSlot}`, { initialBlock, initialSlot, timeout });
    await retryUntil(() => t.monitor.l2SlotNumber >= targetSlot, 'slot', timeout);

    t.logger.info(`Waiting until sentinel processed until slot ${targetSlot}`);
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
      t.logger.info(`Collected validator stats at block ${t.monitor.l2BlockNumber}`, { stats });

      // Check that all validators have attestations recorded
      for (let i = 0; i < VALIDATORS_PER_NODE * NUM_NODES; i++) {
        const validator = t.validators[i].attester.toString().toLowerCase();
        const validatorStats = stats.stats[validator];
        const history = validatorStats.history.filter(h => h.slot > initialSlot && h.slot <= targetSlot);
        t.logger.info(`Asserting stats for validator ${validator}`, { history });
        expect(history.filter(h => h.status === 'attestation-missed').length).toEqual(0);
      }
    }
  });

  it('collects attestations for validators in proposer node when block is not published', async () => {
    // Stop the second node, this means the first block won't be able to propose
    await tryStop(nodes[1]);

    await t.monitor.run();
    const { l2BlockNumber: initialBlock, l2SlotNumber: initialSlot } = t.monitor;

    const timeout = AZTEC_SLOT_DURATION * SLOT_COUNT * 4;
    const targetSlot = Number(initialSlot) + SLOT_COUNT;
    const firstNodeValidators = t.validators.slice(0, VALIDATORS_PER_NODE).map(v => v.attester);
    const offlineValidators = t.validators.slice(VALIDATORS_PER_NODE, VALIDATORS_PER_NODE * 2).map(v => v.attester);

    t.logger.info(
      `Waiting until L2 slot ${targetSlot} and proposer is in first node (${firstNodeValidators.join(', ')})`,
      { initialBlock, initialSlot, timeout, firstNodeValidators },
    );
    await Promise.all([
      retryUntil(() => t.monitor.l2SlotNumber >= targetSlot, `reached slot ${targetSlot}`, timeout),
      retryUntil(
        () => rollup.getCurrentProposer().then(p => firstNodeValidators.some(v => v.equals(EthAddress.fromString(p)))),
        'proposer is first node',
        timeout,
      ),
    ]);

    const slotForSentinel = t.monitor.l2SlotNumber;
    t.logger.info(`Waiting until sentinel processed until slot ${slotForSentinel}`);
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
    t.logger.info(`Collected validator stats at slot ${t.monitor.l2SlotNumber}`, { stats });

    // Check that all of the first node validators have attestations recorded
    for (const validator of firstNodeValidators) {
      const validatorStats = stats.stats[validator.toString().toLowerCase()];
      const history = validatorStats?.history.filter(h => h.slot > initialSlot && h.slot <= targetSlot) ?? [];
      t.logger.info(`Asserting stats for online validator ${validator}`, { history });
      expect(history.filter(h => h.status === 'attestation-missed' || h.status === 'block-missed')).toBeEmpty();
    }

    // At least one of the first node validators must have been seen as proposer
    const firstNodeBlockProposedHistory = firstNodeValidators
      .flatMap(v => stats.stats[v.toString().toLowerCase()].history)
      .filter(h => h.slot > initialSlot && h.slot <= targetSlot)
      .filter(h => h.status === 'block-proposed');
    expect(firstNodeBlockProposedHistory).not.toBeEmpty();

    // And all of the proposers for the offline node must be seen as missed attestation or proposal
    for (const validator of offlineValidators) {
      const validatorStats = stats.stats[validator.toString().toLowerCase()];
      const history = validatorStats.history?.filter(h => h.slot > initialSlot && h.slot <= targetSlot) ?? [];
      t.logger.info(`Asserting stats for offline validator ${validator}`, { history });
      expect(history.filter(h => h.status === 'attestation-missed' || h.status === 'block-missed')).not.toBeEmpty();
    }
  });
});
