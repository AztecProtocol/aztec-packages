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
