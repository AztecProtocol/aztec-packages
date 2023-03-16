import { LevelUp } from 'levelup';
import { toBigIntBE, toBufferBE } from './bigint_buffer.js';
import { MerkleTree } from './merkle_tree.js';
import { SiblingPath } from './sibling_path.js';
import { StandardMerkleTree } from './standard_tree.js';
import { Hasher } from './hasher.js';

const indexToKeyLeaf = (name: string, index: bigint) => {
  return `${name}:leaf:${index}`;
};

interface LeafData {
  value: bigint;
  nextIndex: bigint;
  nextValue: bigint;
}

const encodeTreeValue = (leafData: LeafData) => {
  const valueAsBuffer = toBufferBE(leafData.value, 32);
  const indexAsBuffer = toBufferBE(leafData.nextIndex, 32);
  const nextValueAsBuffer = toBufferBE(leafData.nextValue, 32);
  return Buffer.concat([valueAsBuffer, indexAsBuffer, nextValueAsBuffer]);
};

const decodeTreeValue = (buf: Buffer) => {
  const value = toBigIntBE(buf.subarray(0, 32));
  const nextIndex = toBigIntBE(buf.subarray(32, 64));
  const nextValue = toBigIntBE(buf.subarray(64, 96));
  return {
    value,
    nextIndex,
    nextValue,
  } as LeafData;
};

const initialLeaf: LeafData = {
  value: 0n,
  nextIndex: 0n,
  nextValue: 0n,
};

export class IndexedTree implements MerkleTree {
  private leaves: LeafData[] = [];
  private cachedLeaves: { [key: number]: LeafData } = {};
  constructor(private underlying: StandardMerkleTree, private hasher: Hasher, private db: LevelUp) {}

  public static async new(db: LevelUp, hasher: Hasher, name: string, depth: number) {
    const underlying = await StandardMerkleTree.new(
      db,
      hasher,
      name,
      depth,
      hasher.hashToField(encodeTreeValue(initialLeaf)),
    );
    const tree = new IndexedTree(underlying, hasher, db);
    await tree.init();
    return tree;
  }

  static async fromName(db: LevelUp, hasher: Hasher, name: string) {
    const underlying = await StandardMerkleTree.fromName(
      db,
      hasher,
      name,
      hasher.hashToField(encodeTreeValue(initialLeaf)),
    );
    const tree = new IndexedTree(underlying, hasher, db);
    await tree.initFromDb();
    return tree;
  }

  public getRoot(): Buffer {
    return this.underlying.getRoot();
  }
  public getNumLeaves(): bigint {
    return this.underlying.getNumLeaves();
  }
  public async appendLeaves(leaves: Buffer[]): Promise<void> {
    for (const leaf of leaves) {
      await this.appendLeaf(leaf);
    }
  }
  public async commit(): Promise<void> {
    await this.underlying.commit();
    await this.commitLeaves();
  }
  public async rollback(): Promise<void> {
    await this.underlying.rollback();
    this.rollbackLeaves();
  }
  public async getSiblingPath(index: bigint): Promise<SiblingPath> {
    return await this.underlying.getSiblingPath(index);
  }
  private async appendLeaf(leaf: Buffer): Promise<void> {
    const newValue = toBigIntBE(leaf);
    const indexOfPrevious = this.findIndexOfPreviousValue(newValue);
    const previousLeafCopy = this.getLatestLeafDataCopy(indexOfPrevious.index);
    if (previousLeafCopy === undefined) {
      throw new Error(`Previous leaf not found!`);
    }
    const newLeaf = {
      value: newValue,
      nextIndex: previousLeafCopy.nextIndex,
      nextValue: previousLeafCopy.nextValue,
    } as LeafData;
    if (indexOfPrevious.alreadyPresent) {
      return;
    }
    // insert a new leaf at the highest index and update the values of our previous leaf copy
    const currentSize = this.underlying.getNumLeaves();
    previousLeafCopy.nextIndex = BigInt(currentSize);
    previousLeafCopy.nextValue = newLeaf.value;
    this.cachedLeaves[Number(currentSize)] = newLeaf;
    this.cachedLeaves[Number(indexOfPrevious.index)] = previousLeafCopy;
    const previousTreeValue = encodeTreeValue(previousLeafCopy);
    const newTreeValue = encodeTreeValue(newLeaf);
    await this.underlying.updateLeaf(this.hasher.hashToField(previousTreeValue), BigInt(indexOfPrevious.index));
    await this.underlying.appendLeaves([this.hasher.hashToField(newTreeValue)]);
  }

  private findIndexOfPreviousValue(newValue: bigint) {
    const numLeaves = this.underlying.getNumLeaves();
    const diff: bigint[] = [];
    for (let i = 0; i < numLeaves; i++) {
      const stored = this.getLatestLeafDataCopy(i)!;
      if (stored.value > newValue) {
        diff.push(newValue);
      } else if (stored.value === newValue) {
        return { index: i, alreadyPresent: true };
      } else {
        diff.push(newValue - stored.value);
      }
    }
    const minIndex = this.findMinIndex(diff);
    return { index: minIndex, alreadyPresent: false };
  }

  private findMinIndex(values: bigint[]) {
    if (!values.length) {
      return 0;
    }
    let minIndex = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[minIndex] > values[i]) {
        minIndex = i;
      }
    }
    return minIndex;
  }

  private async init() {
    this.leaves.push(initialLeaf);
    await this.underlying.appendLeaves([this.hasher.hashToField(encodeTreeValue(initialLeaf))]);
    await this.commit();
  }

  private async initFromDb(startingIndex = 0n) {
    const values: LeafData[] = [];
    const promise = new Promise<void>((resolve, reject) => {
      this.db
        .createReadStream({
          gte: indexToKeyLeaf(this.underlying.getName(), startingIndex),
          lte: indexToKeyLeaf(this.underlying.getName(), 2n ** BigInt(this.underlying.getDepth())),
        })
        .on('data', function (data) {
          const index = Number(data.key);
          values[index] = decodeTreeValue(data.value);
        })
        .on('close', function () {})
        .on('end', function () {
          resolve();
        })
        .on('error', function () {
          console.log('stream error');
          reject();
        });
    });
    await promise;
    this.leaves = values;
  }

  private async commitLeaves() {
    const batch = this.db.batch();
    const keys = Object.getOwnPropertyNames(this.cachedLeaves);
    for (const key of keys) {
      const index = Number(key);
      batch.put(key, this.cachedLeaves[index]);
      this.leaves[index] = this.cachedLeaves[index];
    }
    await batch.write();
    this.clearCache();
  }

  private rollbackLeaves() {
    this.clearCache();
  }

  private clearCache() {
    this.cachedLeaves = {};
  }

  private getLatestLeafDataCopy(index: number) {
    const leaf = this.cachedLeaves[index] ?? this.leaves[index];
    return leaf
      ? ({
          value: leaf.value,
          nextIndex: leaf.nextIndex,
          nextValue: leaf.nextValue,
        } as LeafData)
      : undefined;
  }
}
