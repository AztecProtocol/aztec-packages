import { pedersenHash } from '@aztec/foundation/crypto';

/** Computes the expected root of a merkle tree given a leaf and its sibling path. */
export async function computeRootFromSiblingPath(
  leaf: Buffer,
  siblingPath: Buffer[],
  index: number,
  hasher = async (left: Buffer, right: Buffer) => (await pedersenHash([left, right])).toBuffer(),
) {
  let result = leaf;
  for (const sibling of siblingPath) {
    result = index & 1 ? await hasher(sibling, result) : await hasher(result, sibling);
    index >>= 1;
  }
  return result;
}
