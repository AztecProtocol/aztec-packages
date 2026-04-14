#!/usr/bin/env node
/**
 * This script fetches a failed L1 transaction from the L1TxFailedStore and re-simulates it.
 * Supports GCS, S3, R2, and local file paths.
 * Usage: node scripts/replay_failed_l1_tx.mjs gs://bucket/path/simulation/0xabc123.json [--rpc-url URL]
 */
import { createLogger } from '@aztec/foundation/log';
import { ErrorsAbi, RollupAbi } from '@aztec/l1-artifacts';
import { createReadOnlyFileStore } from '@aztec/stdlib/file-store';

import { createPublicClient, decodeErrorResult, http } from 'viem';

const logger = createLogger('script:replay_failed_l1_tx');

// Parse arguments
const args = process.argv.slice(2);
let urlStr;
let rpcUrl;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rpc-url' && args[i + 1]) {
    rpcUrl = args[++i];
  } else if (!urlStr) {
    urlStr = args[i];
  }
}

if (!urlStr) {
  logger.error('Usage: node scripts/replay_failed_l1_tx.mjs <file-uri> [--rpc-url URL]');
  logger.error('Supported URIs: gs://bucket/path, s3://bucket/path, file:///path, https://host/path');
  logger.error('Example: node scripts/replay_failed_l1_tx.mjs gs://my-bucket/failed-l1-txs/simulation/0xabc.json');
  process.exit(1);
}

// Fetch the failed tx data from the store
const store = await createReadOnlyFileStore(urlStr, logger);
if (!store) {
  logger.error(`Failed to create file store from: ${urlStr}`);
  process.exit(1);
}

logger.info(`Fetching failed L1 tx from: ${urlStr}`);

let failedTx;
try {
  const data = await store.read(urlStr);
  failedTx = JSON.parse(data.toString());
} catch (err) {
  logger.error(`Failed to fetch tx from store: ${err.message}`);
  process.exit(1);
}

logger.info(`Loaded failed L1 tx:`, {
  id: failedTx.id,
  failureType: failedTx.failureType,
  actions: failedTx.context.actions,
  timestamp: new Date(failedTx.timestamp).toISOString(),
  error: failedTx.error.message,
});

// Create a client to re-simulate
const defaultRpcUrl = process.env.ETHEREUM_HOST || 'http://localhost:8545';
const effectiveRpcUrl = rpcUrl || defaultRpcUrl;
logger.info(`Using RPC URL: ${effectiveRpcUrl}`);

// Try to detect chain from RPC
const client = createPublicClient({
  transport: http(effectiveRpcUrl),
});

const chainId = await client.getChainId();
logger.info(`Connected to chain ID: ${chainId}`);

// Re-simulate the transaction
logger.info(`Re-simulating transaction...`);
logger.info(`To: ${failedTx.request.to}`);
logger.info(`Data: ${failedTx.request.data.slice(0, 66)}... (${failedTx.request.data.length} chars)`);
if (failedTx.l1BlockNumber) {
  logger.info(`L1 block number: ${failedTx.l1BlockNumber}`);
}

const blockOverrides = failedTx.l1BlockNumber ? { blockOverrides: { number: BigInt(failedTx.l1BlockNumber) } } : {};

try {
  // Try using eth_simulateV1 via simulateBlocks
  const result = await client.simulateBlocks({
    validation: false,
    blocks: [
      {
        ...blockOverrides,
        calls: [
          {
            to: failedTx.request.to,
            data: failedTx.request.data,
          },
        ],
      },
    ],
  });

  if (result[0].calls[0].status === 'failure') {
    logger.error(`Simulation failed as expected:`);
    const errorData = result[0].calls[0].data;
    logger.error(`Raw error data: ${errorData}`);

    // Try to decode the error
    const abis = [...ErrorsAbi, ...RollupAbi];
    try {
      const decoded = decodeErrorResult({ abi: abis, data: errorData });
      logger.error(`Decoded error: ${decoded.errorName}(${decoded.args?.join(', ')})`);
    } catch (decodeErr) {
      logger.warn(`Could not decode error: ${decodeErr.message}`);
    }
  } else {
    logger.info(`Simulation succeeded! The issue may have been resolved.`);
    logger.info(`Gas used: ${result[0].gasUsed}`);
  }
} catch (err) {
  logger.error(`Simulation threw an error: ${err.message}`);

  // Try to extract more details
  if (err.cause) {
    logger.error(`Cause: ${err.cause.message || err.cause}`);
  }
}

// Print summary
logger.info(`\n--- Summary ---`);
logger.info(`Failed tx ID: ${failedTx.id}`);
logger.info(`Failure type: ${failedTx.failureType}`);
logger.info(`Actions: ${failedTx.context.actions.join(', ')}`);
if (failedTx.context.checkpointNumber) {
  logger.info(`Checkpoint: ${failedTx.context.checkpointNumber}`);
}
if (failedTx.context.slot) {
  logger.info(`Slot: ${failedTx.context.slot}`);
}
logger.info(`Original error: ${failedTx.error.message}`);
if (failedTx.error.name) {
  logger.info(`Error name: ${failedTx.error.name}`);
}
if (failedTx.receipt) {
  logger.info(`Receipt tx hash: ${failedTx.receipt.transactionHash}`);
  logger.info(`Receipt block: ${failedTx.receipt.blockNumber}`);
}
