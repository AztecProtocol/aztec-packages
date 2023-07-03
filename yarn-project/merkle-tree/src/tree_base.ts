import { LevelUp, LevelUpChain } from 'levelup';
import { SiblingPath } from './sibling_path/sibling_path.js';
import { Hasher } from './hasher.js';
import { MerkleTree } from './interfaces/merkle_tree.js';
import { toBigIntLE, toBufferLE } from '@aztec/foundation/bigint-buffer';

const MAX_DEPTH = 254;

export const indexToKeyHash = (name: string, level: number, index: bigint) => `${name}:${level}:${index}`;
const encodeMeta = (root: Buffer, depth: number, size: bigint) => {
  const data = Buffer.alloc(36);
  root.copy(data);
  data.writeUInt32LE(depth, 32);
  return Buffer.concat([data, toBufferLE(size, 32)]);
};
export const decodeMeta = (meta: Buffer) => {
  const root = meta.subarray(0, 32);
  const depth = meta.readUInt32LE(32);
  const size = toBigIntLE(meta.subarray(36));
  return {
    root,
    depth,
    size,
  };
};

export const INITIAL_LEAF = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export abstract class TreeBase implements MerkleTree {
  protected readonly maxIndex: bigint;
  protected cachedSize?: bigint;
  private root!: Buffer;
  private zeroHashes: Buffer[] = [];
  protected cache: { [key: string]: Buffer } = {};

  public constructor(
    protected db: LevelUp,
    protected hasher: Hasher,
    protected name: string,
    protected depth: number,
    protected size: bigint = 0n,
    root?: Buffer,
  ) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Invalid depth');
    }

    // Compute the zero values at each layer.
    let current = INITIAL_LEAF;
    for (let i = depth - 1; i >= 0; --i) {
      this.zeroHashes[i] = current;
      current = hasher.compress(current, current);
    }

    this.root = root ? root : current;
    this.maxIndex = 2n ** BigInt(depth) - 1n;
  }

  /**
   * Returns the root of the tree.
   * @param includeUncommitted - If true, root incorporating uncomitted changes is returned.
   * @returns The root of the tree.
   */
  public getRoot(includeUncommitted: boolean): Buffer {
    return !includeUncommitted ? this.root : this.cache[indexToKeyHash(this.name, 0, 0n)] ?? this.root;
  }

  /**
   * Returns the number of leaves in the tree.
   * @param includeUncommitted - If true, the returned number of leaves includes uncomitted changes.
   * @returns The number of leaves in the tree.
   */
  public getNumLeaves(includeUncommitted: boolean) {
    return !includeUncommitted ? this.size : this.cachedSize ?? this.size;
  }

  /**
   * Returns the name of the tree.
   * @returns The name of the tree.
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Returns the depth of the tree.
   * @returns The depth of the tree.
   */
  public getDepth(): number {
    return this.depth;
  }

  /**
   * Returns a sibling path for the element at the given index.
   * @param index - The index of the element.
   * @param includeUncommitted - Indicates whether to get a sibling path incorporating uncommitted changes.
   * @returns A sibling path for the element at the given index.
   * Note: The sibling path is an array of sibling hashes, with the lowest hash (leaf hash) first, and the highest hash last.
   */
  public async getSiblingPath<N extends number>(index: bigint, includeUncommitted: boolean): Promise<SiblingPath<N>> {
    const path: Buffer[] = [];
    let level = this.depth;
    while (level > 0) {
      const isRight = index & 0x01n;
      const sibling = await this.getLatestValueAtIndex(level, isRight ? index - 1n : index + 1n, includeUncommitted);
      path.push(sibling);
      level -= 1;
      index >>= 1n;
    }
    return new SiblingPath<N>(this.depth as N, path);
  }

  /**
   * Commits the changes to the database.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    const batch = this.db.batch();
    const keys = Object.getOwnPropertyNames(this.cache);
    for (const key of keys) {
      batch.put(key, this.cache[key]);
    }
    this.size = this.getNumLeaves(true);
    this.root = this.getRoot(true);
    await this.writeMeta(batch);
    await batch.write();
    this.clearCache();
  }

  /**
   * Rolls back the not-yet-committed changes.
   * @returns Empty promise.
   */
  public rollback(): Promise<void> {
    this.clearCache();
    return Promise.resolve();
  }

  /**
   * Gets the value at the given index.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether to include uncommitted changes.
   * @returns Leaf value at the given index or undefined.
   */
  public getLeafValue(index: bigint, includeUncommitted: boolean): Promise<Buffer | undefined> {
    return this.getLatestValueAtIndex(this.depth, index, includeUncommitted);
  }

  /**
   * Clears the cache.
   */
  private clearCache() {
    this.cache = {};
    this.cachedSize = undefined;
  }

  /**
   * Adds a leaf and all the hashes above it to the cache.
   * @param leaf - Leaf to add to cache.
   * @param index - Index of the leaf (used to derive the cache key).
   */
  protected async addLeafToCacheAndHashToRoot(leaf: Buffer, index: bigint) {
    const key = indexToKeyHash(this.name, this.depth, index);
    let current = leaf;
    this.cache[key] = current;
    let level = this.depth;
    while (level > 0) {
      const isRight = index & 0x01n;
      const sibling = await this.getLatestValueAtIndex(level, isRight ? index - 1n : index + 1n, true);
      const lhs = isRight ? sibling : current;
      const rhs = isRight ? current : sibling;
      current = this.hasher.compress(lhs, rhs);
      level -= 1;
      index >>= 1n;
      const cacheKey = indexToKeyHash(this.name, level, index);
      this.cache[cacheKey] = current;
    }
  }

  /**
   * Returns the latest value at the given index.
   * @param level - The level of the tree.
   * @param index - The index of the element.
   * @param includeUncommitted - Indicates, whether to get include uncommitted changes.
   * @returns The latest value at the given index.
   * Note: If the value is not in the cache, it will be fetched from the database.
   */
  protected async getLatestValueAtIndex(level: number, index: bigint, includeUncommitted: boolean): Promise<Buffer> {
    const key = indexToKeyHash(this.name, level, index);
    if (includeUncommitted && this.cache[key] !== undefined) {
      return this.cache[key];
    }
    const committed = await this.dbGet(key);
    if (committed !== undefined) {
      return committed;
    }
    return this.zeroHashes[level - 1];
  }

  /**
   * Gets a value from db by key.
   * @param key - The key to by which to get the value.
   * @returns A value from the db based on the key.
   */
  private async dbGet(key: string): Promise<Buffer | undefined> {
    return await this.db.get(key).catch(() => {});
  }

  /**
   * Initializes the tree.
   * @param prefilledSize - A number of leaves that are prefilled with values.
   * @returns Empty promise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async init(prefilledSize: number): Promise<void> {
    // prefilledSize is used only by Indexed Tree.
    await this.writeMeta();
  }

  /**
   * Initializes the tree from the database.
   */
  public async initFromDb(): Promise<void> {
    // Implemented only by Inedexed Tree to populate the leaf cache.
  }

  /**
   * Writes meta data to the provided batch.
   * @param batch - The batch to which to write the meta data.
   */
  protected async writeMeta(batch?: LevelUpChain<string, Buffer>) {
    const data = encodeMeta(this.getRoot(true), this.depth, this.getNumLeaves(true));
    if (batch) {
      batch.put(this.name, data);
    } else {
      await this.db.put(this.name, data);
    }
  }
}
