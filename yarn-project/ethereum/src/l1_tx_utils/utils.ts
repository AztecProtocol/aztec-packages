import { compactArray } from '@aztec/foundation/collection';

import type { ContractFunctionExecutionError, GetFeeHistoryReturnType } from 'viem';

import type { ViemClient } from '../types.js';

export function tryGetCustomErrorNameContractFunction(err: ContractFunctionExecutionError) {
  return compactArray([err.shortMessage, ...(err.metaMessages ?? []).slice(0, 2).map(s => s.trim())]).join(' ');
}

/*
 * Returns cost of calldata usage in Ethereum.
 * @param data - Calldata.
 * @returns 4 for each zero byte, 16 for each nonzero.
 */
export function getCalldataGasUsage(data: Uint8Array) {
  return data.filter(byte => byte === 0).length * 4 + data.filter(byte => byte !== 0).length * 16;
}

/**
 * Fetches historical blocks and calculates reward percentiles for blob transactions only.
 * Returns data in the same format as getFeeHistory for easy drop-in replacement.
 *
 * @param client - Viem client to use for RPC calls
 * @param blockCount - Number of historical blocks to fetch
 * @param rewardPercentiles - Array of percentiles to calculate (e.g., [75] for 75th percentile)
 * @returns Object with reward field containing percentile fees for each block, similar to getFeeHistory
 * @throws Error if fetching blocks fails
 */
export async function getBlobPriorityFeeHistory(
  client: ViemClient,
  blockCount: number,
  rewardPercentiles: number[],
): Promise<GetFeeHistoryReturnType> {
  const latestBlockNumber = await client.getBlockNumber();

  // Fetch multiple blocks in parallel
  const blockPromises = Array.from({ length: blockCount }, (_, i) =>
    client.getBlock({
      blockNumber: latestBlockNumber - BigInt(i),
      includeTransactions: true,
    }),
  );

  const blocks = await Promise.all(blockPromises);

  // Process each block to extract blob transaction fees and other data
  const baseFeePerGas: bigint[] = [];
  const gasUsedRatio: number[] = [];
  const reward: bigint[][] = [];

  for (const block of blocks) {
    // Collect base fee per gas
    baseFeePerGas.push(block.baseFeePerGas || 0n);

    // Calculate gas used ratio
    const gasUsed = block.gasUsed || 0n;
    const gasLimit = block.gasLimit || 1n; // Avoid division by zero
    gasUsedRatio.push(Number(gasUsed) / Number(gasLimit));

    if (!block.transactions || block.transactions.length === 0) {
      // No transactions in this block - return zeros for each percentile
      reward.push(rewardPercentiles.map(() => 0n));
      continue;
    }

    // Extract priority fees from blob transactions only
    const blobFees = block.transactions
      .map(tx => {
        // Transaction can be just a hash string
        if (typeof tx === 'string') {
          return 0n;
        }
        // Only consider blob transactions (EIP-4844)
        const isBlobTx = tx.maxFeePerBlobGas !== undefined || (tx as any).blobVersionedHashes !== undefined;
        if (!isBlobTx) {
          return 0n;
        }
        return tx.maxPriorityFeePerGas || 0n;
      })
      .filter((fee: bigint) => fee > 0n);

    if (blobFees.length === 0) {
      // No blob transactions in this block - return zeros for each percentile
      reward.push(rewardPercentiles.map(() => 0n));
      continue;
    }

    // Sort fees for percentile calculation
    const sortedFees = [...blobFees].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    // Calculate requested percentiles
    const percentiles = rewardPercentiles.map(percentile => {
      const index = Math.ceil((sortedFees.length - 1) * (percentile / 100));
      return sortedFees[index];
    });

    reward.push(percentiles);
  }

  // Calculate oldest block number (the last block in our array)
  const oldestBlock = latestBlockNumber - BigInt(blockCount - 1);

  // Reverse arrays to match getFeeHistory behavior (oldest first)
  return {
    baseFeePerGas: baseFeePerGas.reverse(),
    gasUsedRatio: gasUsedRatio.reverse(),
    oldestBlock,
    reward: reward.reverse(),
  };
}
