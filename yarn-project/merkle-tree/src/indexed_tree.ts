import { toBigIntBE, toBufferBE } from './bigint_buffer.js';
import { MerkleTree } from './merkle_tree.js';
import { SiblingPath } from './sibling_path.js';
import { StandardMerkleTree } from './standard_tree.js';

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

export class IndexedTree implements MerkleTree {
  private leaves: LeafData[] = [];
  constructor(private underlying: StandardMerkleTree) {}

  public static async new(
    db: LevelUp,
    hasher: Hasher,
    name: string,
    depth: number,
    initialLeafValue = StandardMerkleTree.ZERO_ELEMENT,
  ) {
    const underlying = await StandardMerkleTree.new(db, hasher, name, depth, initialLeafValue);
    const tree = new IndexedTree(underlying);
    await tree.init();
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
    return await this.underlying.commit();
  }
  public async rollback(): Promise<void> {
    return await this.underlying.rollback();
  }
  public async getSiblingPath(index: bigint): Promise<SiblingPath> {
    return await this.underlying.getSiblingPath(index);
  }
  private async appendLeaf(leaf: Buffer): Promise<void> {
    const newValue = toBigIntBE(leaf);
    const indexOfPrevious = this.findIndexOfPreviousValue(newValue);
    const newLeaf = {
      value: newValue,
      nextIndex: this.leaves[indexOfPrevious.index].nextIndex,
      nextValue: this.leaves[indexOfPrevious.index].nextValue,
    } as LeafData;

    if (!indexOfPrevious.alreadyPresent) {
      this.leaves[indexOfPrevious.index].nextIndex = BigInt(this.leaves.length);
      this.leaves[indexOfPrevious.index].nextValue = newLeaf.value;
      this.leaves.push(newLeaf);
    }

    const oldTreeValue = encodeTreeValue(this.leaves[indexOfPrevious.index]);
    const newTreeValue = encodeTreeValue(newLeaf);
    await this.underlying.updateLeaf(oldTreeValue, BigInt(indexOfPrevious.index));
    await this.underlying.appendLeaves([newTreeValue]);
  }
  private findIndexOfPreviousValue(newValue: bigint) {
    const numLeaves = this.underlying.getNumLeaves();
    const diff: bigint[] = [];
    for (let i = 0; i < numLeaves; i++) {
      const stored = this.leaves[i];
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
    let min = values[0];
    let minIndex = 0;
    for (let i = 1; i < values.length; i++) {
      if (min > values[i]) {
        min = values[i];
        minIndex = i;
      }
    }
    return minIndex;
  }

  private async init() {
    const initialLeaf = {
      value: 0n,
      nextIndex: 0n,
      nextValue: 0n,
    } as LeafData;
    this.leaves.push(initialLeaf);
    const initialData = encodeTreeValue(initialLeaf);
    await this.underlying.appendLeaves(initialData);
  }
}
