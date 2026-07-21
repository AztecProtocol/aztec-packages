import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeUnbalancedMerkleTreeRootAsync } from '@aztec/foundation/trees';

import type { BlockHeader } from '../tx/block_header.js';

export async function computeBlockHeadersHash(blockHeaders: BlockHeader[]): Promise<Fr> {
  const blockHeaderHashes = await Promise.all(blockHeaders.map(header => header.hash()));
  // Must match the implementation in merge_block_rollups.nr, with the **unbalanced** rollup structure
  // (see validate_consecutive_block_rollups.nr > assert_rollups_filled_greedily.nr).
  const blockHeadersHasher = async (left: Uint8Array, right: Uint8Array) =>
    (
      await poseidon2HashWithSeparator([Buffer.from(left), Buffer.from(right)], DomainSeparator.BLOCK_HEADERS_HASH)
    ).toBuffer() as Buffer<ArrayBuffer>;
  const blockHeadersHash = await computeUnbalancedMerkleTreeRootAsync(
    blockHeaderHashes.map(hash => hash.toBuffer()),
    blockHeadersHasher,
  );
  return Fr.fromBuffer(blockHeadersHash);
}
