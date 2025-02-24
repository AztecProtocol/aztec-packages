import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import { type Anvil } from '@viem/anvil';
import {
  type Chain,
  type Client,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicActions,
  type PublicRpcSchema,
  type WalletActions,
  type WalletRpcSchema,
  createWalletClient,
  getContract,
  http,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { startAnvil } from './start_anvil.js';
import { type Delayer, withDelayer } from './tx_delayer.js';

/**
 * Type for a viem wallet and public client using a local private key.
 * Created as: `createWalletClient({ account: privateKeyToAccount(key), transport: http(url), chain }).extend(publicActions)`
 */
export type ViemClient = Client<
  HttpTransport,
  Chain,
  PrivateKeyAccount,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<HttpTransport, Chain> & WalletActions<Chain, PrivateKeyAccount>
>;

describe('tx_delayer', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let logger: Logger;
  let account: PrivateKeyAccount;
  let client: ViemClient;
  let delayer: Delayer;

  const ETHEREUM_SLOT_DURATION = 2;

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: ETHEREUM_SLOT_DURATION }));
    logger = createLogger('ethereum:test:tx_delayer');
  });

  beforeEach(() => {
    const transport = http(rpcUrl);
    account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    ({ client, delayer } = withDelayer(
      createWalletClient({ transport, chain: foundry, account }).extend(publicActions),
      { ethereumSlotDuration: ETHEREUM_SLOT_DURATION },
    ));
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

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });
});
