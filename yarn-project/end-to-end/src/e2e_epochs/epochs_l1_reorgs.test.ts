import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, type AztecNode, Fr, type Logger, retryUntil } from '@aztec/aztec.js';
import { Blob } from '@aztec/blob-lib';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { type ExtendedViemWalletClient, createExtendedL1Client } from '@aztec/ethereum';
import type { ChainMonitor, Delayer } from '@aztec/ethereum/test';
import { timesAsync } from '@aztec/foundation/collection';
import { hexToBuffer } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { ProverNode } from '@aztec/prover-node';

import { jest } from '@jest/globals';
import 'jest-extended';
import { keccak256, parseTransaction } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_l1_reorgs', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let archiver: Archiver;
  let proverNode: ProverNode;
  let monitor: ChainMonitor;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  let l1ClientForMesssages: ExtendedViemWalletClient;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      l1PublishRetryIntervalMS: 300_000, // Do not retry l1 txs, we dont want them to land
      txPropagationMaxQueryAttempts: 2, // We are blocking txs here, so do not spend much time looking for them
      ethereumSlotDuration: process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 4, // Got to speed these tests up for CI
    });
    ({ proverDelayer, sequencerDelayer, context, logger, monitor, L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = test);
    node = context.aztecNode;
    archiver = (node as AztecNodeService).getBlockSource() as Archiver;
    proverNode = context.proverNode!;

    const account = privateKeyToAccount(generatePrivateKey());
    l1ClientForMesssages = createExtendedL1Client(
      [...test.l1Client.chain.rpcUrls.default.http],
      account,
      test.l1Client.chain,
    );

    const fundingTx = await test.l1Client.sendTransaction({
      to: l1ClientForMesssages.account.address,
      value: BigInt(1e16),
    });

    await test.l1Client.waitForTransactionReceipt({ hash: fundingTx });
  });

  afterEach(async () => {
    await context.cheatCodes.eth.setIntervalMining(0);
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
    expect((await monitor.run(true)).l2ProvenBlockNumber).toEqual(0);

    // Wait until the end of the proof submission window for the first epoch
    await test.waitUntilEndOfProofSubmissionWindow(0);

    // Ensure that a new node sees the reorg
    logger.warn(`Syncing new node to test reorg`);
    const newNode = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await newNode.getProvenBlockNumber()).toEqual(0);

    // Latest block number seen by the node may be the current one, or one less if it was *just* mined.
    // This is because the call to createNonValidatorNode will block until the initial sync is completed,
    // but the initial sync is done to the latest L1 block _at the time the initial sync starts_. So a new
    // node may have appeared while the initial sync runs, that's why we account for a small span of blocks.
    const currentBlock = (await monitor.run(true)).l2BlockNumber;
    expect(await newNode.getBlockNumber()).toBeWithin(currentBlock - 1, currentBlock + 1);

    // And check that the old node has processed the reorg as well
    logger.warn(`Testing old node after reorg`);
    expect(await node.getProvenBlockNumber()).toEqual(0);
    expect(await node.getBlockNumber()).toBeWithin(currentBlock - 1, currentBlock + 1);

    logger.warn(`Test succeeded`);
    await newNode.stop();
  });

  it.only('does not prune if a second proof lands within the submission window after the first one is reorged out', async () => {
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
    expect(await node.getBlockNumber()).toBeWithin(currentBlock - 1, currentBlock + 1);

    logger.warn(`Test succeeded`);
  });

  it('restores L2 blocks if a proof is added due to an L1 reorg', async () => {
    // Next proof shall not land
    proverDelayer.cancelNextTx();

    // Expect pending chain to advance, so there's something to be pruned
    await retryUntil(() => node.getBlockNumber().then(b => b > 1), 'node sync', 60, 0.1);

    // Wait until the end of the proof submission window for the first epoch
    await test.waitUntilEndOfProofSubmissionWindow(0);
    await monitor.run(true);
    logger.warn(`End of epoch 0 submission window (L1 block ${await monitor.run(true).then(m => m.l1BlockNumber)}).`);

    // Grab the prover's tx to submit it later as part of a reorg and stop the prover
    const [proofTx] = proverDelayer.getCancelledTxs();
    expect(proofTx).toBeDefined();
    await proverNode.stop();

    // Wait for the node to prune
    const syncTimeout = L2_SLOT_DURATION_IN_S * 2;
    await retryUntil(() => node.getBlockNumber().then(b => b <= 1), 'node sync', syncTimeout, 0.1);
    expect(monitor.l2ProvenBlockNumber).toEqual(0);
    expect(await node.getProvenBlockNumber()).toEqual(0);

    // But not all is lost, for a reorg gets the proof back on chain!
    logger.warn(`Reorging proof back (L1 block ${await monitor.run(true).then(m => m.l1BlockNumber)}).`);
    await context.cheatCodes.eth.reorgWithReplacement(4, [[proofTx]]);
    const proofTxReceipt = await test.l1Client.getTransactionReceipt({ hash: keccak256(proofTx) });
    expect(proofTxReceipt.status).toEqual('success');

    // Monitor should update to see the proof
    const { l2BlockNumber, l2ProvenBlockNumber } = await monitor.run(true);
    expect(l2BlockNumber).toBeGreaterThan(1);
    expect(l2ProvenBlockNumber).toBeGreaterThan(0);

    // And so the node undoes its reorg
    await retryUntil(() => node.getBlockNumber().then(b => b >= l2BlockNumber), 'node sync', syncTimeout, 0.1);
    await retryUntil(() => node.getProvenBlockNumber().then(b => b >= l2ProvenBlockNumber), 'proof sync', 1, 0.1);

    logger.warn(`Test succeeded`);
  });

  it('prunes L2 blocks from pending chain removed from L1 due to an L1 reorg', async () => {
    // Wait until L2_BLOCK_NUMBER is mined and node synced, and stop the sequencer
    const L2_BLOCK_NUMBER = 3;
    await test.waitUntilL2BlockNumber(L2_BLOCK_NUMBER, L2_SLOT_DURATION_IN_S * (L2_BLOCK_NUMBER + 4));
    expect(monitor.l2BlockNumber).toEqual(L2_BLOCK_NUMBER);
    const l1BlockNumber = monitor.l1BlockNumber;
    await retryUntil(() => node.getBlockNumber().then(b => b === L2_BLOCK_NUMBER), 'node sync', 10, 0.1);

    logger.warn(`Reached block ${L2_BLOCK_NUMBER}. Stopping block production.`);
    await context.aztecNodeAdmin!.setConfig({ minTxsPerBlock: 100 });

    // Remove the L2 block from L1
    const l1BlocksToReorg = monitor.l1BlockNumber - l1BlockNumber + 1;
    await context.cheatCodes.eth.reorgWithReplacement(l1BlocksToReorg);
    expect(await monitor.run(true).then(monitor => monitor.l2BlockNumber)).toEqual(L2_BLOCK_NUMBER - 1);
    logger.warn(`Removed block ${L2_BLOCK_NUMBER} via L1 reorg`);

    // And expect the node to prune the block
    await retryUntil(() => node.getBlockNumber().then(b => b === L2_BLOCK_NUMBER - 1), 'node sync', 30, 0.1);
  });

  it('sees new blocks added in an L1 reorg', async () => {
    // Wait until the block *before* L2_BLOCK_NUMBER is mined and node synced
    const L2_BLOCK_NUMBER = 3;
    await test.waitUntilL2BlockNumber(L2_BLOCK_NUMBER - 1, L2_SLOT_DURATION_IN_S * (L2_BLOCK_NUMBER + 4));
    expect(monitor.l2BlockNumber).toEqual(L2_BLOCK_NUMBER - 1);
    await retryUntil(() => node.getBlockNumber().then(b => b === L2_BLOCK_NUMBER - 1), 'node sync', 5, 0.1);

    // Cancel the next tx to be mined and pause the sequencer
    sequencerDelayer.cancelNextTx();
    await retryUntil(() => sequencerDelayer.getCancelledTxs().length, 'next block tx', L2_SLOT_DURATION_IN_S * 2, 0.1);
    const [l2BlockTx] = sequencerDelayer.getCancelledTxs();
    await context.aztecNodeAdmin!.setConfig({ minTxsPerBlock: 100 });

    // Save the L1 block number when the L2 block would have been mined
    const l1BlockNumber = monitor.l1BlockNumber;

    // Wait until a few more L1 blocks go by
    await retryUntil(() => monitor.l1BlockNumber > l1BlockNumber + 1, 'l1 block number', L1_BLOCK_TIME_IN_S * 4, 0.1);
    await retryUntil(() => archiver.getL1BlockNumber() > l1BlockNumber + 1, 'archiver sync', 10, 0.1);
    expect(await node.getBlockNumber()).toEqual(L2_BLOCK_NUMBER - 1);

    // Manually update the archiver's L1 syncpoint to ensure we look back when needed
    // Otherwise this test just passes because we do not update the L1 syncpoint in the archiver since there are no new blocks
    await archiver.dataStore.setBlockSynchedL1BlockNumber(BigInt(archiver.getL1BlockNumber()));

    // Now trigger the reorg. Note that we cannot use reorgWithReplacement here for the reorg, due to an anvil bug with
    // blob txs (now fixed, we can just update its version), so we reorg, then replay the tx, and then mine.
    const reorgDepth = monitor.l1BlockNumber - l1BlockNumber;
    expect(reorgDepth).toBeGreaterThan(0);
    logger.warn(`Triggering ${reorgDepth}-block L1 reorg to include L2 block`);
    await context.cheatCodes.eth.reorg(reorgDepth);
    expect(await context.cheatCodes.eth.blockNumber()).toEqual(l1BlockNumber);
    logger.warn(`Sending L2 block tx to L1`);
    const txHash = await test.l1Client.sendRawTransaction({ serializedTransaction: l2BlockTx });
    await context.cheatCodes.eth.mine(reorgDepth);

    // Check that the tx was reorged in and succeeded. We log the trace to debug any issues with the tx.
    const txReceipt = await test.l1Client.getTransactionReceipt({ hash: txHash });
    logger.warn(`L2 block tx receipt`, { receipt: txReceipt });
    logger.warn(`L2 block tx trace`, { trace: await context.cheatCodes.eth.traceTransaction(txHash) });
    expect(txReceipt.status).toEqual('success');
    expect(txReceipt.blobGasUsed).toBeGreaterThan(0n);
    expect(await monitor.run(true).then(m => m.l2BlockNumber)).toEqual(L2_BLOCK_NUMBER);

    // We also need to send the blob to the sink, so the node can get it
    logger.warn(`Sending blobs to blob sink`);
    const blobs = await getBlobs(l2BlockTx);
    const blobSinkClient = createBlobSinkClient(context.config);
    await blobSinkClient.sendBlobsToBlobSink(txReceipt.blockHash, blobs);

    // And wait for the node to see the new block
    await retryUntil(() => node.getBlockNumber().then(b => b === L2_BLOCK_NUMBER), 'node sync', 5, 0.1);
  });

  it('updates L1 to L2 messages changed due to an L1 reorg', async () => {
    const sendMessage = async () =>
      sendL1ToL2Message(
        { recipient: await AztecAddress.random(), content: Fr.random(), secretHash: Fr.random() },
        {
          l1Client: l1ClientForMesssages,
          l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses,
        },
      );

    // Send 3 messages and wait for archiver sync
    logger.warn(`Sending 3 cross chain messages`);
    const msgs = await timesAsync(3, async (i: number) => {
      logger.warn(`Sending message ${i + 1}`);
      return await sendMessage();
    });
    logger.warn(`Sent messages on L1 blocks ${msgs.map(m => m.txReceipt.blockNumber)}`);

    await retryUntil(
      () => node.isL1ToL2MessageSynced(msgs.at(-1)!.msgHash),
      'message sync',
      msgs.length * L1_BLOCK_TIME_IN_S * 2,
      1,
    );

    // Reorg the last message out
    logger.warn(`Triggering reorg to remove last message`);
    const l1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
    const l1BlocksToReorg = l1BlockNumber - Number(msgs.at(-1)!.txReceipt.blockNumber) + 1;
    await context.cheatCodes.eth.reorg(l1BlocksToReorg);
    const newMsg = await sendMessage();
    logger.warn(`Sent new message on L1 block ${newMsg.txReceipt.blockNumber}`);

    // New msg gets synced, and old one is out
    await retryUntil(() => node.isL1ToL2MessageSynced(newMsg.msgHash), 'new message sync', L1_BLOCK_TIME_IN_S * 6, 1);
    expect(await node.isL1ToL2MessageSynced(msgs[0].msgHash)).toBe(true);
    expect(await node.isL1ToL2MessageSynced(msgs.at(-1)!.msgHash)).toBe(false);
  });
});

function getBlobs(serializedTx: `0x${string}`) {
  const parsedTx = parseTransaction(serializedTx);
  if (parsedTx.sidecars === false) {
    throw new Error('No sidecars found in tx');
  }
  return Promise.all(parsedTx.sidecars!.map(sidecar => Blob.fromEncodedBlobBuffer(hexToBuffer(sidecar.blob))));
}
