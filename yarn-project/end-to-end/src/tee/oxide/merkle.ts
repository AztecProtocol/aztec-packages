import { sha256Trunc } from '@aztec/foundation/crypto/sha256';

// sha256-trunc binary merkle tree matching the Aztec inbox / outbox hashing.
// Used by in-memory test L1 clients to produce real inbox / outbox sibling
// paths + roots the TEE verifies against, so the bridge e2e exercises the
// verification path rather than trivially accepting client-returned data.

const LEAF_BYTES = 32;
const ZERO_LEAF = Buffer.alloc(LEAF_BYTES);

function hashPair(left: Buffer, right: Buffer): Buffer {
  return sha256Trunc(Buffer.concat([left, right]));
}

export function computeRootFromSiblingPath(leaf: Buffer, siblingPath: Buffer[], leafIndex: bigint): Buffer {
  if (leaf.length !== LEAF_BYTES) {
    throw new Error(`leaf must be ${LEAF_BYTES} bytes, got ${leaf.length}`);
  }
  if (leafIndex < 0n) {
    throw new Error(`leaf index must be non-negative, got ${leafIndex}`);
  }
  let node = leaf;
  let index = leafIndex;
  for (const sibling of siblingPath) {
    if (sibling.length !== LEAF_BYTES) {
      throw new Error(`sibling must be ${LEAF_BYTES} bytes, got ${sibling.length}`);
    }
    const isRight = (index & 1n) === 1n;
    node = isRight ? hashPair(sibling, node) : hashPair(node, sibling);
    index >>= 1n;
  }
  return node;
}

export class MerkleTree {
  private readonly levels: Buffer[][];

  constructor(
    readonly height: number,
    leaves: Buffer[],
  ) {
    if (!Number.isInteger(height) || height < 0) {
      throw new Error(`height must be a non-negative integer, got ${height}`);
    }
    const size = 1 << height;
    if (leaves.length > size) {
      throw new Error(`too many leaves for height ${height}: ${leaves.length} > ${size}`);
    }
    for (const leaf of leaves) {
      if (leaf.length !== LEAF_BYTES) {
        throw new Error(`leaf must be ${LEAF_BYTES} bytes, got ${leaf.length}`);
      }
    }
    const padded: Buffer[] = [
      ...leaves,
      ...Array.from({ length: size - leaves.length }, () => Buffer.from(ZERO_LEAF)),
    ];
    this.levels = [padded];
    for (let h = 0; h < height; h++) {
      const prev = this.levels[h];
      const next: Buffer[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        next.push(hashPair(prev[i], prev[i + 1]));
      }
      this.levels.push(next);
    }
  }

  get root(): Buffer {
    return this.levels[this.height][0];
  }

  siblingPath(index: bigint): Buffer[] {
    const size = BigInt(1 << this.height);
    if (index < 0n || index >= size) {
      throw new Error(`leaf index out of range: ${index} not in [0, ${size})`);
    }
    const path: Buffer[] = [];
    let idx = index;
    for (let h = 0; h < this.height; h++) {
      const siblingIdx = Number(idx ^ 1n);
      path.push(this.levels[h][siblingIdx]);
      idx >>= 1n;
    }
    return path;
  }
}
