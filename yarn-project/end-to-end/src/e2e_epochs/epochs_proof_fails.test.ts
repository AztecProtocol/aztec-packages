import { type Logger, getTimestampRangeForEpoch, sleep } from '@aztec/aztec.js';
import { BatchedBlob } from '@aztec/blob-lib';
import type { ViemClient } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor, DelayedTxUtils, type Delayer, waitUntilL1Timestamp } from '@aztec/ethereum/test';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { ProverNodePublisher } from '@aztec/prover-node';
import type { TestProverNode } from '@aztec/prover-node/test';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_proof_fails', () => {
  let context: EndToEndContext;
  let l1Client: ViemClient;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      maxSpeedUpAttempts: 0, // No speed ups
      startProverNode: false, // Avoid early proving
      ethereumSlotDuration: 8,
    });
    ({ sequencerDelayer, context, l1Client, rollup, constants, logger, monitor } = test);
    ({ L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('does not allow submitting proof after epoch end', async () => {
    // Here we cause a re-org by not publishing the proof for epoch 0 until after the end of epoch 1
    // The proof will be rejected and a re-org will take place

    // Create prover node after test setup to avoid early proving. We ensure the prover does not retry txs.
    const proverNode = await test.createProverNode({ cancelTxOnTimeout: false, maxSpeedUpAttempts: 0 });
    context.proverNode = proverNode;

    // Get the prover delayer from the newly created prover node
    proverDelayer = (((proverNode as TestProverNode).publisher as ProverNodePublisher).l1TxUtils as DelayedTxUtils)
      .delayer!;

    // Hold off prover tx until end epoch 1
    const [epoch2Start] = getTimestampRangeForEpoch(2n, constants);
    proverDelayer.pauseNextTxUntilTimestamp(epoch2Start);
    logger.info(`Delayed prover tx until epoch 2 starts at ${epoch2Start}`);

    // Wait until the start of epoch 1 and grab the block number
    await test.waitUntilEpochStarts(1);
    const blockNumberAtEndOfEpoch0 = Number(await rollup.getBlockNumber());
    logger.info(`Starting epoch 1 after L2 block ${blockNumberAtEndOfEpoch0}`);

    // Wait until the last block of epoch 1 is published and then hold off the sequencer.
    await test.waitUntilL2BlockNumber(
      blockNumberAtEndOfEpoch0 + test.epochDuration,
      test.L2_SLOT_DURATION_IN_S * (test.epochDuration + 4),
    );
    sequencerDelayer.pauseNextTxUntilTimestamp(epoch2Start + BigInt(L1_BLOCK_TIME_IN_S));

    // Next sequencer to publish a block should trigger a rollback to block 1
    await waitUntilL1Timestamp(l1Client, epoch2Start + BigInt(L1_BLOCK_TIME_IN_S));
    expect(await rollup.getBlockNumber()).toEqual(1n);
    expect(await rollup.getSlotNumber()).toEqual(BigInt(2 * test.epochDuration));

    // The prover tx should have been rejected, and mined strictly before the one that triggered the rollback
    const lastProverTxHash = proverDelayer.getSentTxHashes().at(-1);
    const lastProverTxReceipt = await l1Client.getTransactionReceipt({ hash: lastProverTxHash! });
    expect(lastProverTxReceipt.status).toEqual('reverted');

    const lastL2BlockTxHash = sequencerDelayer.getSentTxHashes().at(-1);
    const lastL2BlockTxReceipt = await l1Client.getTransactionReceipt({ hash: lastL2BlockTxHash! });
    expect(lastL2BlockTxReceipt.status).toEqual('success');
    expect(lastL2BlockTxReceipt.blockNumber).toBeGreaterThan(lastProverTxReceipt!.blockNumber);
    logger.info(`Test succeeded`);
  });

  it('aborts proving if end of next epoch is reached', async () => {
    // Create prover node after test setup to avoid early proving
    const proverNode = await test.createProverNode({ cancelTxOnTimeout: false, maxSpeedUpAttempts: 0 });

    // Get the prover delayer from the newly created prover node
    proverDelayer = (((proverNode as TestProverNode).publisher as ProverNodePublisher).l1TxUtils as DelayedTxUtils)
      .delayer!;

    // Inject a delay in prover node proving equal to the length of an epoch, to make sure deadline will be hit
    const epochProverManager = (proverNode as TestProverNode).prover;
    const originalCreate = epochProverManager.createEpochProver.bind(epochProverManager);
    const finalizeEpochPromise = promiseWithResolvers<void>();
    jest.spyOn(epochProverManager, 'createEpochProver').mockImplementation(() => {
      const prover = originalCreate();
      jest.spyOn(prover, 'finalizeEpoch').mockImplementation(async () => {
        const seconds = L2_SLOT_DURATION_IN_S * (test.epochDuration * 2); // Forgive me for I have sinned.
        logger.warn(`Finalize epoch: sleeping ${seconds}s.`);
        await sleep(seconds * 1000);
        logger.warn(`Finalize epoch: returning.`);
        finalizeEpochPromise.resolve();
        const ourPublicInputs = RootRollupPublicInputs.random();
        const ourBatchedBlob = new BatchedBlob(
          ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
          ourPublicInputs.blobPublicInputs.z,
          ourPublicInputs.blobPublicInputs.y,
          ourPublicInputs.blobPublicInputs.c,
          ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value for Q
        );
        return { publicInputs: ourPublicInputs, proof: Proof.empty(), batchedBlobInputs: ourBatchedBlob };
      });
      return prover;
    });
    context.proverNode = proverNode;

    await test.waitUntilEpochStarts(1);
    logger.info(`Starting epoch 1`);
    const proverTxCount = proverDelayer.getSentTxHashes().length;

    await test.waitUntilEpochStarts(2);
    logger.info(`Starting epoch 2`);

    // No proof for epoch zero should have landed during epoch one
    expect(monitor.l2ProvenBlockNumber).toEqual(0);

    // Wait until the prover job finalizes (and a bit more) and check that it aborted and never attempted to submit a tx
    logger.info(`Awaiting finalize epoch`);
    await finalizeEpochPromise.promise;
    await sleep(1000);
    expect(proverDelayer.getSentTxHashes().length - proverTxCount).toEqual(0);
  });
});
