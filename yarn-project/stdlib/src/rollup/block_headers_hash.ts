import { Fr } from '@aztec/foundation/curves/bn254';
import { computeUnbalancedPoseidonRoot } from '@aztec/foundation/trees';

import type { BlockHeader } from '../tx/block_header.js';

export async function computeBlockHeadersHash(blockHeaders: BlockHeader[]): Promise<Fr> {
  const blockHeaderHashes = await Promise.all(blockHeaders.map(header => header.hash()));
  // Must match the implementation in merge_block_rollups.nr, with the **unbalanced** rollup structure
  // (see validate_consecutive_block_rollups.nr > assert_rollups_filled_greedily.nr).
  const blockHeadersHash = await computeUnbalancedPoseidonRoot(blockHeaderHashes.map(hash => hash.toBuffer()));
  return Fr.fromBuffer(blockHeadersHash);
}
