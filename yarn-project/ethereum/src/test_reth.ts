import { Blob } from '@aztec/foundation/blob';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { type Chain, createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const logger = createLogger('ethereum:test_reth');

const url = 'http://0.0.0.0:8545';

// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH

const WEI_CONST = 1_000_000_000n;

// Derive accounts from mnemonic
const mnemonic = 'test test test test test test test test test test test junk';
const fillerAccounts = Array(10)
  .fill(0)
  .map((_, i) => mnemonicToAccount(mnemonic, { addressIndex: i }));
const mainAccount = mnemonicToAccount(mnemonic, { addressIndex: 10 });

const chain: Chain = {
  id: 1337,
  name: 'Ethereum',
  rpcUrls: {
    default: {
      http: [url],
    },
  },
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
};

async function main() {
  const transport = http(url);
  const publicClient = createPublicClient({
    transport,
    chain,
  });

  // Create wallet clients for each filler account
  const fillerWallets = fillerAccounts.map(account =>
    createWalletClient({
      transport,
      chain,
      account,
    }),
  );

  // Create main wallet client for blob transactions
  const mainWallet = createWalletClient({
    transport,
    chain,
    account: mainAccount,
  });

  logger.info('Connected to local reth node');

  const chainId = await publicClient.getChainId();
  logger.info(`Chain ID: ${chainId}`);

  try {
    // Get starting nonces for all filler wallets
    const walletNonces = await Promise.all(
      fillerWallets.map(wallet => {
        const address = wallet.account.address;
        return publicClient.getTransactionCount({ address });
      }),
    );
    logger.info('Starting nonces:', walletNonces);

    // Send many high-fee transactions to fill the block
    logger.info('Sending block-filling transactions...');
    const numFillingTxs = 10;

    // Keep track of nonce increments per wallet
    const currentNonces = [...walletNonces];

    const fillTxPromises = Array(numFillingTxs)
      .fill(0)
      .map((_, i) => {
        const walletIndex = i % fillerWallets.length;
        const wallet = fillerWallets[walletIndex];
        const nonce = currentNonces[walletIndex]++; // Use and increment nonce

        // Generate unique random data for each transaction
        const dataSize = 50000;
        const randomData = new Uint8Array(dataSize);
        crypto.getRandomValues(randomData);
        const data = ('0x' +
          Array.from(randomData)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')) as `0x${string}`;

        logger.debug(`Sending tx ${i} from wallet ${walletIndex} with nonce ${nonce}`);

        // Create test blob data
        const blobData = new Uint8Array(131072).fill(1);
        const kzg = Blob.getViemKzgInstance();

        return wallet.sendTransaction({
          to: mainAccount.address,
          value: 1_000n,
          maxFeePerGas: 2000n * WEI_CONST, // 2000 gwei
          maxPriorityFeePerGas: 200n * WEI_CONST, // 200 gwei
          maxFeePerBlobGas: 200n * WEI_CONST, // 200 gwei
          nonce,
          data,
          blobs: [blobData],
          kzg,
        });
      });

    // Send in batches to not overwhelm the node
    const batchSize = 10;
    // let exampleTxHash: `0x${string}` | null = null;
    for (let i = 0; i < fillTxPromises.length; i += batchSize) {
      const batch = fillTxPromises.slice(i, i + batchSize);
      // const txs = await Promise.all(batch);
      await Promise.all(batch);
      logger.info(`Sent batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(fillTxPromises.length / batchSize)}`);
      // exampleTxHash = txs[0];
    }
    logger.info('Sent all block-filling transactions');

    // get a tx as example
    // if (exampleTxHash) {
    // const tx = await publicClient.getTransaction({ hash: exampleTxHash });
    // logger.info('tx', tx.);
    // }

    // Create test blob data
    const blobData1 = new Uint8Array(131072).fill(0);
    const blobData2 = new Uint8Array(131072).fill(3);
    const kzg = Blob.getViemKzgInstance();

    // Send blob transaction with lower gas price from main account
    logger.info(`Sending blob transaction from ${mainWallet.account.address}`);
    const blobTxHash = await mainWallet.sendTransaction({
      to: mainAccount.address,
      value: parseEther('0.0001'),
      blobs: [blobData1, blobData2],
      kzg,
      maxFeePerBlobGas: 100n * WEI_CONST,
      maxFeePerGas: 100n * WEI_CONST,
      maxPriorityFeePerGas: 10n * WEI_CONST,
    });
    logger.info(`Blob transaction sent with hash: ${blobTxHash}`);

    await sleep(6000);

    // check if the blob tx is mined
    const tx = await publicClient.getTransaction({ hash: blobTxHash });
    if (tx.blockNumber !== null) {
      logger.error(`Blob transaction  mined in block ${tx.blockNumber}`);
      const block = await publicClient.getBlock({ blockNumber: tx.blockNumber });
      logger.info('block', block.transactions.length);
      process.exit(1);
    }

    const latestBlock = await publicClient.getBlock();

    logger.info('latest block: ', {
      txs: latestBlock.transactions.length,
      includedOurs: latestBlock.transactions.find(val => val === blobTxHash) ? 'yes' : 'no',
    });

    // Send cancellation with higher gas price
    const newBlobData = new Uint8Array(131072).fill(2);
    logger.info('Sending cancellation transaction...');
    const blobTx = await publicClient.getTransaction({ hash: blobTxHash });
    const cancelTxHash = await mainWallet.sendTransaction({
      to: mainAccount.address,
      value: 0n,
      nonce: blobTx.nonce,
      maxFeePerBlobGas: 200n * WEI_CONST, // 30 gwei
      maxFeePerGas: 200n * WEI_CONST, // 30 gwei
      maxPriorityFeePerGas: 20n * WEI_CONST, // 3 gwei
      blobs: [newBlobData],
      kzg,
      gas: 21_000n,
    });

    // Monitor which transaction gets mined and in which block
    logger.info('Monitoring transactions...');
    const startBlock = await publicClient.getBlockNumber();

    while (true) {
      const cancelReceipt = await publicClient.getTransactionReceipt({ hash: cancelTxHash }).catch(() => null);

      if (cancelReceipt) {
        logger.info('Cancellation transaction was mined!', {
          status: cancelReceipt.status,
          blockNumber: cancelReceipt.blockNumber,
          blocksAfterStart: cancelReceipt.blockNumber - startBlock,
          gasUsed: cancelReceipt.gasUsed,
        });
        break;
      }

      await sleep(2000);
    }
  } catch (err) {
    // Write error to file
    const errorLog = {
      timestamp: new Date().toISOString(),
      error:
        err instanceof Error
          ? {
              name: err.name,
              message: err.message,
              stack: err.stack,
            }
          : err,
    };

    const errorFile = './reth_test_error.json';
    writeFileSync(errorFile, JSON.stringify(errorLog, null, 2), 'utf8');

    logger.error(`Error during test. Details written to ${errorFile}`);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
main().catch(err => {
  // Write error to file
  const errorLog = {
    timestamp: new Date().toISOString(),
    error:
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
          }
        : err,
  };

  const errorFile = './reth_test_error.json';
  writeFileSync(errorFile, JSON.stringify(errorLog, null, 2), 'utf8');

  logger.error(`Fatal error. Details written to ${errorFile}`);
  process.exit(1);
});
