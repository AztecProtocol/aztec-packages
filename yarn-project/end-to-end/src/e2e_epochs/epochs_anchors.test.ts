// In these test we will explicitly check correct execution when the sequencer respectively
// 1. keep producing blocks, ensuring that the last anchor is sufficient
// 2. stops producing blocks, meaning that the last anchor is insufficient
import type { Logger } from '@aztec/aztec.js';
import type { InboxContract, ViemClient } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/test';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_anchors', () => {
  let l1Client: ViemClient;
  let rollup: RollupContract;
  let inbox: InboxContract;
  let constants: L1RollupConstants;
  let logger: Logger;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;

  let test: EpochsTestContext;

  beforeEach(async () => {
    // Abusing the delayer to also easily get the transactions from the prover

    // Bumping the epoch duration to 5 because otherwise it takes a full epoch before the actual test starts,
    // which means the prover node is attempting to prove before we setup the mocks.
    test = await EpochsTestContext.setup({ aztecEpochDuration: 5 });
    ({ proverDelayer, sequencerDelayer, l1Client, rollup, inbox, constants, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('prover NEED to lower anchor', async () => {
    const startLatestAnchor = await inbox.getLastAnchorBlockNumber();

    // Wait until the start of epoch 1 and grab the block number
    await test.waitUntilEpochStarts(1);
    const blockNumberAtEndOfEpoch0 = Number(await rollup.getBlockNumber());
    logger.info(`Starting epoch 1 after L2 block ${blockNumberAtEndOfEpoch0}`);

    // Wait until the last block of epoch 1 is published and then hold off the sequencer.
    // Note that the tx below will block the sequencer until it times out
    // the txPropagationMaxQueryAttempts until #10824 is fixed.
    const endOfEpoch1 = blockNumberAtEndOfEpoch0 + test.epochDuration;
    await test.waitUntilL2BlockNumber(endOfEpoch1, test.L2_SLOT_DURATION_IN_S * (test.epochDuration + 4));

    // We need to make sure that the chain have progressed.
    expect(await rollup.getBlockNumber()).toEqual(BigInt(endOfEpoch1));
    expect(await rollup.getSlotNumber()).toEqual(BigInt(test.epochDuration * 2 - 1));

    expect(await inbox.getLastAnchorBlockNumber()).toBeGreaterThan(startLatestAnchor);
    const lastL2BlockTxHash = sequencerDelayer.getSentTxHashes().at(-1);
    const lastL2BlockTxReceipt = await l1Client.getTransactionReceipt({ hash: lastL2BlockTxHash! });
    expect(lastL2BlockTxReceipt.status).toEqual('success');

    // There must be transactions to both the rollup and the inbox.
    let haveSeenInbox = false;
    let haveSeenRollup = false;
    for (const txHash of proverDelayer.getSentTxHashes()) {
      const txReceipt = await l1Client.getTransactionReceipt({ hash: txHash });
      if (txReceipt.to === inbox.address) {
        haveSeenInbox = true;
      } else if (txReceipt.to === rollup.address) {
        haveSeenRollup = true;
      }
    }

    expect(haveSeenInbox).toBe(true);
    expect(haveSeenRollup).toBe(true);

    logger.info(`Test succeeded`);
  });

  it('prover does NOT need to lower anchor', async () => {
    // Because there are no real proofs. We need to slightly delay things from the prover
    proverDelayer.delayBy(constants.slotDuration);

    const startLatestAnchor = await inbox.getLastAnchorBlockNumber();

    // Wait until the start of epoch 1 and grab the block number
    await test.waitUntilEpochStarts(1);
    const blockNumberAtEndOfEpoch0 = Number(await rollup.getBlockNumber());
    logger.info(`Starting epoch 1 after L2 block ${blockNumberAtEndOfEpoch0}`);

    // Wait until the last block of epoch 1 is published and then hold off the sequencer.
    // Note that the tx below will block the sequencer until it times out
    // the txPropagationMaxQueryAttempts until #10824 is fixed.
    const endOfEpoch1 = blockNumberAtEndOfEpoch0 + test.epochDuration;
    await test.waitUntilL2BlockNumber(endOfEpoch1, test.L2_SLOT_DURATION_IN_S * (test.epochDuration + 4));

    // We need to make sure that the chain have progressed.
    expect(await rollup.getBlockNumber()).toEqual(BigInt(endOfEpoch1));
    expect(await rollup.getSlotNumber()).toEqual(BigInt(test.epochDuration * 2 - 1));

    expect(await inbox.getLastAnchorBlockNumber()).toBeGreaterThan(startLatestAnchor);
    const lastL2BlockTxHash = sequencerDelayer.getSentTxHashes().at(-1);
    const lastL2BlockTxReceipt = await l1Client.getTransactionReceipt({ hash: lastL2BlockTxHash! });
    expect(lastL2BlockTxReceipt.status).toEqual('success');

    // All transactions sent by the prover should be to the rollup, none for the inbox
    for (const txHash of proverDelayer.getSentTxHashes()) {
      const txReceipt = await l1Client.getTransactionReceipt({ hash: txHash });
      expect(txReceipt.to).not.toEqual(inbox.address);
    }

    logger.info(`Test succeeded`);
  });
});
