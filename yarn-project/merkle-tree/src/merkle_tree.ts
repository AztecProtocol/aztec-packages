import { LevelUp, LevelUpChain } from 'levelup';
import { HashPath } from './hash_path.js';
import { Hasher } from './hasher.js';

const MAX_DEPTH = 32;

function keepNLsb(input: number, numBits: number) {
  return numBits >= MAX_DEPTH ? input : input & ((1 << numBits) - 1);
}

export class MerkleTree {
  public static ZERO_ELEMENT = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  private root!: Buffer;
  private zeroHashes: Buffer[] = [];

  constructor(
    private db: LevelUp,
    private hasher: Hasher,
    private name: string,
    private depth: number,
    private size: number = 0,
    root?: Buffer,
    private initialLeafValue = MerkleTree.ZERO_ELEMENT,
  ) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Bad depth');
    }

    // Compute the zero values at each layer.
    let current = initialLeafValue;
    for (let i = 0; i < depth; ++i) {
      this.zeroHashes[i] = current;
      current = hasher.compress(current, current);
    }

    this.root = root ? root : current;
  }

  static async new(
    db: LevelUp,
    hasher: Hasher,
    name: string,
    depth: number,
    initialLeafValue = MerkleTree.ZERO_ELEMENT,
  ) {
    const tree = new MerkleTree(db, hasher, name, depth, 0, undefined, initialLeafValue);
    await tree.writeMeta();

    return tree;
  }

  static async fromName(db: LevelUp, hasher: Hasher, name: string, initialLeafValue = MerkleTree.ZERO_ELEMENT) {
    const meta: Buffer = await db.get(Buffer.from(name));
    const root = meta.slice(0, 32);
    const depth = meta.readUInt32LE(32);
    const size = meta.readUInt32LE(36);
    return new MerkleTree(db, hasher, name, depth, size, root, initialLeafValue);
  }

  public async syncFromDb() {
    const meta: Buffer = await this.db.get(Buffer.from(this.name));
    this.root = meta.slice(0, 32);
    this.depth = meta.readUInt32LE(32);
    this.size = meta.readUInt32LE(36);
  }

  private async writeMeta(batch?: LevelUpChain<string, Buffer>) {
    const data = Buffer.alloc(40);
    this.root.copy(data);
    data.writeUInt32LE(this.depth, 32);
    data.writeUInt32LE(this.size, 36);
    if (batch) {
      batch.put(this.name, data);
    } else {
      await this.db.put(this.name, data);
    }
  }

  public getRoot() {
    return this.root;
  }

  public getSize() {
    return this.size;
  }

  /**
   * Returns a hash path for the element at the given index.
   * The hash path is an array of pairs of hashes, with the lowest pair (leaf hashes) first, and the highest pair last.
   */
  public async getHashPath(index: number) {
    const path = new HashPath();

    let data = await this.dbGet(this.root);

    for (let i = this.depth - 1; i >= 0; --i) {
      if (!data) {
        // This is an empty subtree. Fill in zero value.
        path.data[i] = [this.zeroHashes[i], this.zeroHashes[i]];
        continue;
      }

      if (data.length > 64) {
        // Data is a subtree. Extract hash pair at height i.
        const subtreeDepth = i + 1;
        let layerSize = 2 ** subtreeDepth;
        let offset = 0;
        index = keepNLsb(index, subtreeDepth);
        for (let j = 0; j < subtreeDepth; ++j) {
          index -= index & 0x1;
          const lhsOffset = offset + index * 32;
          path.data[j] = [data.slice(lhsOffset, lhsOffset + 32), data.slice(lhsOffset + 32, lhsOffset + 64)];
          offset += layerSize * 32;
          layerSize >>= 1;
          index >>= 1;
        }
        break;
      }

      const lhs = data.slice(0, 32);
      const rhs = data.slice(32, 64);
      path.data[i] = [lhs, rhs];
      const isRight = (index >> i) & 0x1;
      data = await this.dbGet(isRight ? rhs : lhs);
    }

    return path;
  }

  public async updateElement(index: number, value: Buffer) {
    return await this.updateLeafHash(index, value.equals(Buffer.alloc(32, 0)) ? this.initialLeafValue : value);
  }

  public async updateLeafHash(index: number, leafHash: Buffer) {
    const batch = this.db.batch();
    this.root = await this.updateElementInternal(this.root, leafHash, index, this.depth, batch);

    this.size = Math.max(this.size, index + 1);

    await this.writeMeta(batch);
    await batch.write();
  }

  private async updateElementInternal(
    root: Buffer,
    value: Buffer,
    index: number,
    height: number,
    batch: LevelUpChain<Buffer, Buffer>,
  ) {
    if (height === 0) {
      return value;
    }

    const data = await this.dbGet(root);
    const isRight = (index >> (height - 1)) & 0x1;

    let left = data ? data.slice(0, 32) : this.zeroHashes[height - 1];
    let right = data ? data.slice(32, 64) : this.zeroHashes[height - 1];
    const subtreeRoot = isRight ? right : left;
    const newSubtreeRoot = await this.updateElementInternal(
      subtreeRoot,
      value,
      keepNLsb(index, height - 1),
      height - 1,
      batch,
    );

    if (isRight) {
      right = newSubtreeRoot;
    } else {
      left = newSubtreeRoot;
    }
    const newRoot = this.hasher.compress(left, right);
    batch.put(newRoot, Buffer.concat([left, right]));
    if (!root.equals(newRoot)) {
      batch.del(root);
    }
    return newRoot;
  }

  public async updateElements(index: number, values: Buffer[]) {
    const zeroBuf = Buffer.alloc(32, 0);
    return await this.updateLeafHashes(
      index,
      values.map(v => (v.equals(zeroBuf) ? this.initialLeafValue : v)),
    );
  }

  /**
   * Updates all the given values, starting at index. This is optimal when inserting multiple values, as it can
   * compute a single subtree and insert it in one go.
   * However it comes with restrictions:
   * - The insertion index must be a multiple of the subtree size, which must be power of 2.
   * - The insertion index must be >= the current size of the tree (inserting into an empty location).
   *
   * We cannot over extend the tree size, as these inserts are bulk inserts, and a subsequent update would involve
   * a lot of complexity adjusting a previously inserted bulk insert. For this reason depending on the number of
   * values to insert, it will be chunked into the fewest number of subtrees required to grow the tree be precisely
   * that size. In normal operation (e.g. continuously inserting 64 values), we will be able to leverage single inserts.
   * Only when synching creates a non power of 2 set of values will the chunking mechanism come into play.
   * e.g. If we need insert 192 values, first a subtree of 128 is inserted, then a subtree of 64.
   */
  public async updateLeafHashes(index: number, leafHashes: Buffer[]) {
    while (leafHashes.length) {
      const batch = this.db.batch();
      let subtreeDepth = Math.ceil(Math.log2(leafHashes.length));
      let subtreeSize = 2 ** subtreeDepth;

      // We need to reduce the size of the subtree being inserted until it is:
      // a) Less than or equal in size to the number of values being inserted.
      // b) Fits in a subtree, with a size that is a multiple of the insertion index.
      while (leafHashes.length < subtreeSize || index % subtreeSize !== 0) {
        subtreeSize >>= 1;
        subtreeDepth--;
      }

      const toInsert = leafHashes.slice(0, subtreeSize);
      const hashes = await this.hasher.hashToTree(toInsert);

      this.root = await this.updateElementsInternal(this.root, hashes, index, this.depth, subtreeDepth, batch);

      // Slice off inserted values and adjust next insertion index.
      leafHashes = leafHashes.slice(subtreeSize);
      index += subtreeSize;
      this.size = index;

      await this.writeMeta(batch);
      await batch.write();
    }
  }

  private async updateElementsInternal(
    root: Buffer,
    hashes: Buffer[],
    index: number,
    height: number,
    subtreeHeight: number,
    batch: LevelUpChain<Buffer, Buffer>,
  ) {
    if (height === subtreeHeight) {
      const root = hashes.pop()!;
      batch.put(root, Buffer.concat(hashes));
      return root;
    }

    // Do nothing if updating zero values.
    if (hashes[hashes.length - 1].equals(this.zeroHashes[height - 1])) {
      return root;
    }

    const data = await this.dbGet(root);
    const isRight = (index >> (height - 1)) & 0x1;

    if (data && data.length > 64) {
      if (!root.equals(hashes[hashes.length - 1])) {
        throw new Error('Attempting to update pre-existing subtree.');
      }
      return root;
    }

    let left = data ? data.slice(0, 32) : this.zeroHashes[height - 1];
    let right = data ? data.slice(32, 64) : this.zeroHashes[height - 1];
    const subtreeRoot = isRight ? right : left;
    const newSubtreeRoot = await this.updateElementsInternal(
      subtreeRoot,
      hashes,
      keepNLsb(index, height - 1),
      height - 1,
      subtreeHeight,
      batch,
    );

    if (isRight) {
      right = newSubtreeRoot;
    } else {
      left = newSubtreeRoot;
    }
    const newRoot = this.hasher.compress(left, right);
    batch.put(newRoot, Buffer.concat([left, right]));
    if (!root.equals(newRoot)) {
      batch.del(root);
    }
    return newRoot;
  }

  private async dbGet(key: Buffer): Promise<Buffer | undefined> {
    return await this.db.get(key).catch(() => {});
  }
}
