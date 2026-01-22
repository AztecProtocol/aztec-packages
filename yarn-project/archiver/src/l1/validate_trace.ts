import type { ViemPublicDebugClient } from '@aztec/ethereum/types';
import type { Logger } from '@aztec/foundation/log';

import type { Hex } from 'viem';
import type { ZodSchema } from 'zod';

import { callTraceSchema } from './debug_tx.js';
import { traceTransactionResponseSchema } from './trace_tx.js';

/**
 * Helper function to test a trace method with validation
 *
 * @param client - The Viem public debug client
 * @param txHash - Transaction hash to trace
 * @param schema - Zod schema to validate the response
 * @param method - Name of the RPC method ('debug_traceTransaction' or 'trace_transaction')
 * @param blockType - Type of block being tested ('recent' or 'old')
 * @param logger - Logger instance
 * @returns true if the method works and validation passes, false otherwise
 */
async function testTraceMethod(
  client: ViemPublicDebugClient,
  txHash: Hex,
  schema: ZodSchema,
  method: 'debug_traceTransaction' | 'trace_transaction',
  blockType: string,
  logger: Logger,
): Promise<boolean> {
  try {
    // Make request with appropriate params based on method name
    const result = await client.request(
      method === 'debug_traceTransaction'
        ? { method, params: [txHash, { tracer: 'callTracer' }] }
        : { method, params: [txHash] },
    );

    schema.parse(result);
    logger.debug(`${method} works for ${blockType} blocks`);
    return true;
  } catch (error) {
    logger.warn(`${method} failed for ${blockType} blocks: ${error}`);
    return false;
  }
}

/** Result of trace availability checks */
export interface TraceAvailability {
  /** Whether debug_traceTransaction works for recent blocks */
  debugTraceRecent: boolean;
  /** Whether trace_transaction works for recent blocks */
  traceTransactionRecent: boolean;
  /** Whether debug_traceTransaction works for old blocks (512 blocks ago) */
  debugTraceOld: boolean;
  /** Whether trace_transaction works for old blocks (512 blocks ago) */
  traceTransactionOld: boolean;
}

/**
 * Validates the availability of debug/trace methods on the Ethereum client.
 *
 * @param client - The Viem public debug client
 * @param logger - Logger instance
 * @returns Object indicating which trace methods are available for recent and old blocks
 */
export async function validateTraceAvailability(
  client: ViemPublicDebugClient,
  logger: Logger,
): Promise<TraceAvailability> {
  const result: TraceAvailability = {
    debugTraceRecent: false,
    traceTransactionRecent: false,
    debugTraceOld: false,
    traceTransactionOld: false,
  };

  try {
    // Get the latest block
    let latestBlock = await client.getBlock({ blockTag: 'latest' });
    let attempts = 10;

    // Loop back to find a block with transactions (handles dev/test scenarios)
    while (!hasTxs(latestBlock) && latestBlock.number && latestBlock.number > 0n && --attempts > 0) {
      logger.debug(`Block ${latestBlock.number} has no transactions, checking previous block`);
      latestBlock = await client.getBlock({ blockNumber: latestBlock.number - 1n });
    }

    if (!hasTxs(latestBlock)) {
      logger.warn('No blocks with transactions found from latest back to genesis, cannot validate trace availability');
      return result;
    }

    // Get a transaction from the found block
    const recentTxHash = latestBlock.transactions[0] as Hex;

    // Test debug_traceTransaction with recent block
    result.debugTraceRecent = await testTraceMethod(
      client,
      recentTxHash,
      callTraceSchema,
      'debug_traceTransaction',
      'recent',
      logger,
    );

    // Test trace_transaction with recent block
    result.traceTransactionRecent = await testTraceMethod(
      client,
      recentTxHash,
      traceTransactionResponseSchema,
      'trace_transaction',
      'recent',
      logger,
    );

    // Get a block from 512 blocks ago
    const oldBlockNumber = latestBlock.number ? latestBlock.number - 512n : null;
    if (!oldBlockNumber || oldBlockNumber < 0n) {
      logger.debug('Cannot test old blocks, blockchain too short');
      return result;
    }

    let oldBlock = await client.getBlock({ blockNumber: oldBlockNumber });
    attempts = 10;

    // Loop back to find a block with transactions (handles dev/test scenarios)
    while (!hasTxs(oldBlock) && oldBlock.number && oldBlock.number > 0n && --attempts > 0) {
      logger.debug(`Block ${oldBlock.number} has no transactions, checking previous block`);
      oldBlock = await client.getBlock({ blockNumber: oldBlock.number - 1n });
    }

    if (!hasTxs(oldBlock)) {
      logger.debug(
        'No blocks with transactions found from old block back to genesis, cannot validate trace availability for old blocks',
      );
      return result;
    }

    const oldTxHash = oldBlock.transactions[0] as Hex;

    // Test debug_traceTransaction with old block
    result.debugTraceOld = await testTraceMethod(
      client,
      oldTxHash,
      callTraceSchema,
      'debug_traceTransaction',
      'old',
      logger,
    );

    // Test trace_transaction with old block
    result.traceTransactionOld = await testTraceMethod(
      client,
      oldTxHash,
      traceTransactionResponseSchema,
      'trace_transaction',
      'old',
      logger,
    );
  } catch (error) {
    logger.warn(`Error validating debug_traceTransaction and trace_transaction availability: ${error}`);
  }

  return result;
}

function hasTxs(block: { transactions?: Hex[] }): boolean {
  return Array.isArray(block.transactions) && block.transactions.length > 0;
}

/**
 * Validates trace availability and logs appropriate messages based on the results.
 * Optionally throws an error if no trace methods are available and ethereumAllowNoDebugHosts is false.
 *
 * @param client - The Viem public debug client
 * @param ethereumAllowNoDebugHosts - If false, throws an error when no trace methods are available
 * @param logger - Logger instance
 * @throws Error if ethereumAllowNoDebugHosts is false and no trace methods are available
 */
export async function validateAndLogTraceAvailability(
  client: ViemPublicDebugClient,
  ethereumAllowNoDebugHosts: boolean,
  logger: Logger,
): Promise<void> {
  logger.debug('Validating trace/debug method availability...');

  const availability = await validateTraceAvailability(client, logger);

  // Check if we have support for old blocks (either debug or trace)
  const hasOldBlockSupport = availability.debugTraceOld || availability.traceTransactionOld;

  if (hasOldBlockSupport) {
    // Ideal case: we have trace support for old blocks
    const methods: string[] = [];
    if (availability.debugTraceOld) {
      methods.push('debug_traceTransaction');
    }
    if (availability.traceTransactionOld) {
      methods.push('trace_transaction');
    }
    logger.info(
      `Ethereum client supports trace methods for old blocks (${methods.join(', ')}). Archiver can retrieve historical transaction traces.`,
    );
  } else if (availability.debugTraceRecent || availability.traceTransactionRecent) {
    // Warning case: only recent block support
    const methods: string[] = [];
    if (availability.debugTraceRecent) {
      methods.push('debug_traceTransaction');
    }
    if (availability.traceTransactionRecent) {
      methods.push('trace_transaction');
    }
    logger.warn(
      `Ethereum client only supports trace methods for recent blocks (${methods.join(', ')}). Historical transaction traces may not be available.`,
    );
  } else {
    // Error case: no support at all
    const errorMessage =
      'Ethereum debug client does not support debug_traceTransaction or trace_transaction methods. Transaction tracing will not be available. This may impact archiver syncing.';

    if (ethereumAllowNoDebugHosts) {
      logger.warn(`${errorMessage} Continuing because ETHEREUM_ALLOW_NO_DEBUG_HOSTS is set to true.`);
    } else {
      logger.error(errorMessage);
      throw new Error(`${errorMessage} Set ETHEREUM_ALLOW_NO_DEBUG_HOSTS=true to bypass this check.`);
    }
  }
}
