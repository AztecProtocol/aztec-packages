import { Blob } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import type { Anvil } from '@viem/anvil';
import { type PrivateKeyAccount, createWalletClient, fallback, getContract, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import type { ExtendedViemWalletClient } from '../types.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import { startAnvil } from './start_anvil.js';
import { type Delayer, waitUntilBlock, withDelayer } from './tx_delayer.js';

describe('tx_delayer', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let logger: Logger;
  let account: PrivateKeyAccount;
  let client: ExtendedViemWalletClient;
  let delayer: Delayer;
  let cheatCodes: EthCheatCodes;
  let dateProvider: TestDateProvider;

  const ETHEREUM_SLOT_DURATION = 2;

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: ETHEREUM_SLOT_DURATION }));
    cheatCodes = new EthCheatCodes([rpcUrl]);
    logger = createLogger('ethereum:test:tx_delayer');
  });

  beforeEach(() => {
    account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    dateProvider = new TestDateProvider();
    const _client = createWalletClient({
      transport: fallback([http(rpcUrl)]),
      chain: foundry,
      account,
    }).extend(publicActions);
    ({ client, delayer } = withDelayer(_client, dateProvider, { ethereumSlotDuration: ETHEREUM_SLOT_DURATION }));
  });

  const receiptNotFound = expect.objectContaining({ name: 'TransactionReceiptNotFoundError' });

  it('sends a regular tx', async () => {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const hash = await client.sendTransaction({ to: account.address });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt).toBeDefined();
    expect(receipt.blockNumber).toEqual(blockNumber + 1n);
  });

  it('delays a transaction until a given L1 block number', async () => {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    delayer.pauseNextTxUntilBlock(blockNumber + 3n);
    logger.info(`Pausing next tx until block ${blockNumber + 3n}`);

    const delayedTxHash = await client.sendTransaction({ to: account.address });
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Awaiting receipt.`);
    const delayedTxReceipt = await client.waitForTransactionReceipt({ hash: delayedTxHash });
    expect(delayedTxReceipt.blockNumber).toEqual(blockNumber + 3n);
  }, 20000);

  it('delays a transaction until a given L1 timestamp', async () => {
    const block = await client.getBlock({ includeTransactions: false });
    const timestamp = block.timestamp;
    delayer.pauseNextTxUntilTimestamp(timestamp + 6n);
    logger.info(`Pausing next tx until timestamp ${timestamp + 6n}`);

    const delayedTxHash = await client.sendTransaction({ to: account.address });
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Awaiting receipt.`);
    const delayedTxReceipt = await client.waitForTransactionReceipt({ hash: delayedTxHash });
    expect(delayedTxReceipt.blockNumber).toEqual(block.number + 3n);
  }, 20000);

  it('delays a tx sent through a contract', async () => {
    const deployTxHash = await client.deployContract({
      abi: TestERC20Abi,
      bytecode: TestERC20Bytecode,
      args: ['test', 'TST', account.address],
    });
    const { contractAddress, blockNumber } = await client.waitForTransactionReceipt({
      hash: deployTxHash,
      pollingInterval: 100,
    });
    logger.info(`Deployed contract at ${contractAddress} on block ${blockNumber}`);

    delayer.pauseNextTxUntilBlock(blockNumber + 3n);
    logger.info(`Pausing next tx until block ${blockNumber + 3n}`);

    const contract = getContract({ address: contractAddress!, abi: TestERC20Abi, client });
    const delayedTxHash = await contract.write.mint([account.address, 100n]);
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Awaiting receipt.`);
    const delayedTxReceipt = await client.waitForTransactionReceipt({ hash: delayedTxHash });
    expect(delayedTxReceipt.blockNumber).toEqual(blockNumber + 3n);
  }, 20000);

  it('delays a transaction sent too close to the end of a slot', async () => {
    delayer.setMaxInclusionTimeIntoSlot(ETHEREUM_SLOT_DURATION - 1);

    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    await waitUntilBlock(client, blockNumber + 1n);
    logger.info(`Block ${blockNumber + 1n} just mined. Waiting for nearing the end of the slot.`);
    await sleep(ETHEREUM_SLOT_DURATION * 1000 - 500);

    logger.info(`Sending tx to be delayed.`);
    const delayedTxHash = await client.sendTransaction({ to: account.address });
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Awaiting receipt.`);
    const delayedTxReceipt = await client.waitForTransactionReceipt({ hash: delayedTxHash });
    expect(delayedTxReceipt.blockNumber).toEqual(blockNumber + 3n);
  }, 20000);

  it('does not delay a transaction sent early in the slot', async () => {
    delayer.setMaxInclusionTimeIntoSlot(ETHEREUM_SLOT_DURATION - 1);

    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    await waitUntilBlock(client, blockNumber + 1n);
    await sleep(100);

    const txHash = await client.sendTransaction({ to: account.address });
    const txReceipt = await client.waitForTransactionReceipt({ hash: txHash });
    expect(txReceipt.blockNumber).toEqual(blockNumber + 2n);
  }, 20000);

  it('cancels a tx and sends it later manually', async () => {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    delayer.cancelNextTx();
    logger.info(`Cancelling next tx`);

    const delayedTxHash = await client.sendTransaction({ to: account.address });
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Waiting for one block to pass.`);
    await retryUntil(() => client.getBlockNumber({ cacheTime: 0 }).then(b => b === blockNumber + 1n), 'block', 20, 0.1);
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Manually resending tx.`);
    const [tx] = delayer.getCancelledTxs();
    const txHash = await client.sendRawTransaction({ serializedTransaction: tx });
    expect(txHash).toEqual(delayedTxHash);
    await client.waitForTransactionReceipt({ hash: delayedTxHash });
  }, 20000);

  it('cancels a tx with blobs and sends it later manually', async () => {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const blobs = [new Uint8Array(131072).fill(1)];
    const kzg = Blob.getViemKzgInstance();
    const maxFeePerBlobGas = BigInt(1e10);
    const nonce = await client.getTransactionCount({ address: account.address });
    const txRequest = { to: account.address, blobs, kzg, maxFeePerBlobGas, nonce };

    // We first disable mining and check the txHash as returned by anvil
    logger.info(`Sending initial tx not to be mined`);
    await cheatCodes.setIntervalMining(0);
    const expectedTxHash = await client.sendTransaction(txRequest);
    await cheatCodes.dropTransaction(expectedTxHash);
    await cheatCodes.setIntervalMining(ETHEREUM_SLOT_DURATION);
    await expect(client.getTransactionReceipt({ hash: expectedTxHash })).rejects.toThrow(receiptNotFound);

    // And then try the delayer flow, checking we produced the correct txHash
    logger.info(`Cancelling next tx`);
    delayer.cancelNextTx();

    const delayedTxHash = await client.sendTransaction(txRequest);
    expect(delayedTxHash).toEqual(expectedTxHash);
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Delayed tx sent. Waiting for one block to pass.`);
    await retryUntil(() => client.getBlockNumber({ cacheTime: 0 }).then(b => b === blockNumber + 1n), 'block', 20, 0.1);
    await expect(client.getTransactionReceipt({ hash: delayedTxHash })).rejects.toThrow(receiptNotFound);

    logger.info(`Manually resending tx`);
    const [tx] = delayer.getCancelledTxs();
    const txHash = await client.sendRawTransaction({ serializedTransaction: tx });
    expect(txHash).toEqual(delayedTxHash);
    const receipt = await client.waitForTransactionReceipt({ hash: delayedTxHash });
    expect(receipt.blobGasUsed).toBeGreaterThan(0n);
  }, 20000);

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });
});
