import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

/** Computes the expected root of a merkle tree given a leaf and its sibling path. */
export function computeRootFromSiblingPath(
  leaf: Buffer,
  siblingPath: Buffer[],
  index: number,
  hasher = (left: Buffer, right: Buffer) => pedersenHash([Fr.fromBuffer(left), Fr.fromBuffer(right)]).toBuffer(),
) {
  let result = leaf;
  for (const sibling of siblingPath) {
    result = index & 1 ? hasher(sibling, result) : hasher(result, sibling);
    index >>= 1;
  }
  return result;
}
