import { type AztecNode, type Logger, retryUntil } from '@aztec/aztec.js';
import type { ChainMonitor, Delayer } from '@aztec/ethereum/test';
import { executeTimeout } from '@aztec/foundation/timer';
import type { ProverNode } from '@aztec/prover-node';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const ARE_L1_REORGS_PROPERLY_HANDLED_YET = false;

describe('e2e_epochs/epochs_l1_reorgs', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let proverNode: ProverNode;
  let monitor: ChainMonitor;
  let proverDelayer: Delayer;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({ l1PublishRetryIntervalMS: 300_000 }); // Do not retry l1 txs
    ({ proverDelayer, context, logger, monitor } = test);
    node = context.aztecNode;
    proverNode = context.proverNode!;
  });

  afterEach(async () => {
    await test.teardown();
  });

  it('prunes L2 blocks if a proof is removed due to an L1 reorg', async () => {
    // Wait until we have proven something and the nodes have caught up
    logger.warn(`Waiting for initial proof to land`);
    const provenBlock = await test.waitUntilProvenL2BlockNumber(1);
    await retryUntil(() => node.getProvenBlockNumber().then(p => p >= provenBlock), 'node sync', 10, 0.1);

    // Stop the prover node so it doesn't re-submit the proof after we've removed it
    logger.warn(`Proof for block ${provenBlock} mined, stopping prover node`);
    await proverNode.stop();

    // And remove the proof from L1
    await context.cheatCodes.eth.reorg(2);
    await monitor.run();
    expect(monitor.l2ProvenBlockNumber).toEqual(0);

    // Wait until the end of the proof submission window for the first epoch
    await test.waitUntilEndOfProofSubmissionWindow(0);

    // Ensure that a new node sees the reorg
    logger.warn(`Syncing new node to test reorg`);
    const newNode = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await newNode.getProvenBlockNumber()).toEqual(0);

    // Latest block number seen by the node may be the current one, or one less if it was *just* mined
    const currentBlock = monitor.l2BlockNumber;
    expect(await newNode.getBlockNumber()).toBeLessThanOrEqual(currentBlock);
    expect(await newNode.getBlockNumber()).toBeGreaterThanOrEqual(currentBlock - 1);

    // And check that the old node has processed the reorg as well
    if (ARE_L1_REORGS_PROPERLY_HANDLED_YET) {
      logger.warn(`Testing old node after reorg`);
      expect(await node.getProvenBlockNumber()).toEqual(0);
      expect(await node.getBlockNumber()).toBeLessThanOrEqual(currentBlock);
      expect(await node.getBlockNumber()).toBeGreaterThanOrEqual(currentBlock - 1);
    }

    logger.warn(`Test succeeded`);
    await newNode.stop();
  });

  it('does not prune if a second proof lands within the submission window after the first one is reorged out', async () => {
    // Wait until we have proven something and the nodes have caught up
    logger.warn(`Waiting for initial proof to land`);
    const provenBlock = await test.waitUntilProvenL2BlockNumber(1);
    await retryUntil(() => node.getProvenBlockNumber().then(p => p >= provenBlock), 'node sync', 10, 0.1);

    // Remove the proof from L1 but do not change the block number
    await context.cheatCodes.eth.reorgWithReplacement(1);
    await expect(monitor.run(true).then(m => m.l2ProvenBlockNumber)).resolves.toEqual(0);

    // Create another prover node so it submits a proof
    await test.createProverNode();

    // Wait until the end of the proof submission window for the first epoch
    await test.waitUntilEndOfProofSubmissionWindow(0);

    // And expect that the other node has submitted a proof
    await expect(monitor.run(true).then(m => m.l2ProvenBlockNumber)).resolves.toBeGreaterThanOrEqual(1);

    // Check that the node has followed along
    logger.warn(`Testing old node`);
    const currentBlock = monitor.l2BlockNumber;
    expect(await node.getProvenBlockNumber()).toBeGreaterThanOrEqual(1);
    expect(await node.getBlockNumber()).toBeLessThanOrEqual(currentBlock);
    expect(await node.getBlockNumber()).toBeGreaterThanOrEqual(currentBlock - 1);

    logger.warn(`Test succeeded`);
  });

  it('restores L2 blocks if a proof is added due to an L1 reorg', async () => {
    // Next proof shall not land
    proverDelayer.cancelNextTx();
    const [proofTx] = proverDelayer.getCancelledTxs();

    // Wait until the end of the proof submission window for the first epoch
    await test.waitUntilEndOfProofSubmissionWindow(0);

    // We see a prune on chain and stop the prover node
    await monitor.run(true);
    expect(monitor.l2BlockNumber).toBeLessThanOrEqual(1);
    expect(monitor.l2ProvenBlockNumber).toEqual(0);
    await proverNode.stop();

    // And the node prunes as well (we give it at most a few seconds to sync)
    await retryUntil(() => node.getBlockNumber().then(b => b === monitor.l2BlockNumber), 'node sync', 5, 0.1);

    // But not all is lost, for a reorg gets the proof back on chain!
    await context.cheatCodes.eth.reorgWithReplacement(2, [[proofTx]]);
    await monitor.run(true);
    expect(monitor.l2BlockNumber).toBeGreaterThan(1);
    expect(monitor.l2ProvenBlockNumber).toBeGreaterThan(0);

    // So the node undoes its reorg
    if (ARE_L1_REORGS_PROPERLY_HANDLED_YET) {
      await retryUntil(() => node.getBlockNumber().then(b => b === monitor.l2BlockNumber), 'node sync', 5, 0.1);
      await expect(node.getProvenBlockNumber()).resolves.toEqual(monitor.l2ProvenBlockNumber);
    }

    logger.warn(`Test succeeded`);
  });
});
