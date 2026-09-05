import { BaseError, ContractFunctionRevertedError } from 'viem';

import type { ViemClient } from '../types.js';
import { BlockTagTooOldError } from './errors.js';

const L1_NON_ARCHIVE_BLOCK_HISTORY_LENGTH = 128n;

export async function checkBlockTag(block: bigint | undefined, publicClient: ViemClient) {
  if (block === undefined) {
    return;
  }
  const latestBlock = await publicClient.getBlockNumber();
  if (block < latestBlock - L1_NON_ARCHIVE_BLOCK_HISTORY_LENGTH) {
    throw new BlockTagTooOldError(block, latestBlock);
  }
}

/** Returns the name of the custom error a viem contract call reverted with, if the revert data could be decoded. */
export function getRevertedErrorName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) {
    return undefined;
  }
  const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
  return revertError instanceof ContractFunctionRevertedError ? revertError.data?.errorName : undefined;
}
