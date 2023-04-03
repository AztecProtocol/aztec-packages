import { LevelUp } from 'levelup';
import { toBigIntBE, toBufferBE } from '@aztec/foundation';
import { MerkleTree } from '../merkle_tree.js';
import { SiblingPath } from '../sibling_path/sibling_path.js';
import { StandardMerkleTree } from '../standard_tree/standard_tree.js';
import { Hasher } from '../hasher.js';

const indexToKeyLeaf = (name: string, index: bigint) => {
  return `${name}:leaf:${index}`;
};

/**
 * A leaf of a tree.
 */
export interface LeafData {
  /**
   * A value of the leaf.
   */
  value: bigint;
  /**
   * An index of the next leaf.
   */
  nextIndex: bigint;
  /**
   * A value of the next leaf.
   */
  nextValue: bigint;
}

export interface LowNullifierWitnessData {
  /**
   * Preimage of the low nullifier that proves non membership
    */
  preimage: LeafData;
  /**
   * Sibling path to prove membership of low nullifier
    */
  siblingPath: SiblingPath;
  /**
   * The index of low nullifier
   */
  index: bigint;
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
const encodeTreeValue = (leafData: LeafData) => {
  const valueAsBuffer = toBufferBE(leafData.value, 32);
  const indexAsBuffer = toBufferBE(leafData.nextIndex, 32);
  const nextValueAsBuffer = toBufferBE(leafData.nextValue, 32);
  return Buffer.concat([valueAsBuffer, indexAsBuffer, nextValueAsBuffer]);
};

// TODO: Check which version of hash we need to match the cpp implementation
const hashEncodedTreeValue = (leaf: LeafData, hasher: Hasher) => {
  return hasher.hashToField(
    Buffer.concat([leaf.value, leaf.nextIndex, leaf.nextValue].map(val => toBufferBE(val, 32))),
  );
  return hasher.compressInputs([leaf.value, leaf.nextIndex, leaf.nextValue].map(val => toBufferBE(val, 32)));
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

/**
 * A Merkle tree that supports efficient lookup of leaves by value.
 */
export class IndexedTree implements MerkleTree {
  private leaves: LeafData[] = [];
  private cachedLeaves: { [key: number]: LeafData } = {};
  constructor(private underlying: StandardMerkleTree, private hasher: Hasher, private db: LevelUp) {}

  /**
   * Creates an IndexedTree object.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - A name of the tree.
   * @param depth - A depth of the tree.
   * @returns A promise with the new Merkle tree.
   */
  public static async new(db: LevelUp, hasher: Hasher, name: string, depth: number): Promise<IndexedTree> {
    const underlying = await StandardMerkleTree.new(db, hasher, name, depth, hashEncodedTreeValue(initialLeaf, hasher));
    const tree = new IndexedTree(underlying, hasher, db);
    await tree.init();
    return tree;
  }

  /**
   * Creates a new tree and sets its root, depth and size based on the meta data which are associated with the name.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - Name of the tree.
   * @returns The newly created tree.
   */
  static async fromName(db: LevelUp, hasher: Hasher, name: string): Promise<IndexedTree> {
    const underlying = await StandardMerkleTree.fromName(db, hasher, name, hashEncodedTreeValue(initialLeaf, hasher));
    const tree = new IndexedTree(underlying, hasher, db);
    await tree.initFromDb();
    return tree;
  }

  /**
   * Returns the root of the tree.
   * @returns The root of the tree.
   */
  public getRoot(includeUncommitted: boolean): Buffer {
    return this.underlying.getRoot(includeUncommitted);
  }

  /**
   * Returns the number of leaves in the tree.
   * @returns The number of leaves in the tree.
   */
  public getNumLeaves(includeUncommitted: boolean): bigint {
    return this.underlying.getNumLeaves(includeUncommitted);
  }

  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(leaves: Buffer[]): Promise<void> {
    for (const leaf of leaves) {
      await this.appendLeaf(leaf);
    }
  }


  // TODO: this will have alot more information returned from it to craft the correct inputs
  // TODO: should this function similate on a copy of the tree rather than making actual changes?
  /**
   * Each base rollup needs to provide non membership / inclusion proofs for each of the nullifiers 
   * generated in the kernel circuit that it is rolling up. 
   * 
   * As leaves are batch inserted at the end, batch updates are a special case. 
   * 
   * WARNING: This function has side effects, it will insert values into the tree.
   *
   * TODO: include indepth insertion writeup in this comment
   * @param leaves Values to insert into the tree
   * @returns 
   */
  // TODO: assumptions
  // 1. There are 8 nullifiers provided and they are all unique
  // 2. If kc 0 has 1 nullifier, and kc 1 has 3 nullifiers the layout will assume to be the sparse
  //   nullifier layout: [kc0N, 0, 0, 0, kc1N, kc1N, kc1N, 0]
  public async getAndPerformBaseRollupBatchInsertionProofs(leaves: Buffer[]): Promise<LowNullifierWitnessData[]> {
    // Keep track of the touched during batch insertion
    const touchedNodes: Set<number> = new Set<number>();
    
    const lowNullifierWitnesses: LowNullifierWitnessData[] = [];
    const startInsertionIndex: bigint = this.getNumLeaves();
    let currInsertionIndex: bigint = startInsertionIndex;
    
    // Leaf data of hte leaves to be inserted
    const insertionSubtree: LeafData[] = [];

    // Low nullifier membership proof sibling paths
    for (const leaf of leaves) {
      const newValue = toBigIntBE(leaf);
      const indexOfPrevious = this.findIndexOfPreviousValue(newValue);
      
      // NOTE: null values for nullfier leaves are being changed to 0n current impl is a hack
      // Default value
      let nullifierLeaf: LeafData = {
        value: 0n,
        nextIndex: 0n,
        nextValue: 0n
      };

      if (touchedNodes.has(indexOfPrevious.index)) {
        // If the node has already been touched, then we return an empty leaf and sibling path
        const emptySP = new SiblingPath();
        emptySP.data = Array(this.underlying.getDepth()).fill(Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"));
        const witness: LowNullifierWitnessData = {
            preimage: initialLeaf,
            index: 0n,
            siblingPath: emptySP
        };
        lowNullifierWitnesses.push(witness);
      } else {
        // If the node has not been touched, we update its low nullifier pointer, but we do NOT insert it yet, inserting it now 
        // will alter non membership paths of the not yet inserted members
        // Insertion is done at the end once updates have already occured.
        touchedNodes.add(indexOfPrevious.index);

        const newValue = toBigIntBE(leaf);
        const lowNullifier = this.getLatestLeafDataCopy(indexOfPrevious.index);

        if (lowNullifier === undefined) {
          throw new Error(`Previous leaf not found!`);
        }
        
        // Get sibling path for existence of the old leaf
        const siblingPath = await this.underlying.getSiblingPath(BigInt(indexOfPrevious.index));

        // Update the running paths
        const witness = {
          preimage: lowNullifier,
          index: BigInt(indexOfPrevious.index),
          siblingPath: siblingPath
        }
        lowNullifierWitnesses.push(witness);

        // Update subtree insertion leaf from null data
        nullifierLeaf =  {
          value: newValue,
          nextIndex: lowNullifier.nextIndex,
          nextValue: lowNullifier.nextValue,
        };

        // Update the current low nullifier
        lowNullifier.nextIndex = currInsertionIndex;
        lowNullifier.nextValue = BigInt(newValue);

        // Update the old leaf in the tree
        this.cachedLeaves[Number(indexOfPrevious.index)] = lowNullifier;
        await this.underlying.updateLeaf(hashEncodedTreeValue(lowNullifier, this.hasher), BigInt(indexOfPrevious.index));
      }

      // increment insertion index
      currInsertionIndex++;
      insertionSubtree.push(nullifierLeaf);
    }

    // Create insertion subtree and forcefully insert in series
    // Here we calculate the pointers for the inserted values, if they have not already been updated
    for (let i = 0 ; i < leaves.length; i++) {
      const newValue = toBigIntBE(leaves[i]);

      // We have already fetched the new low nullifier for this leaf, so we can set its low nullifier
      const lowNullifier = lowNullifierWitnesses[i].preimage;
      // If the lowNullifier is 0, then we check the previous leaves for the low nullifier leaf
      if (lowNullifier.value === 0n && lowNullifier.nextIndex === 0n && lowNullifier.nextValue === 0n) {
        for (let j = 0; j < i; j++) {
          if ((insertionSubtree[j].nextValue >newValue&&
               insertionSubtree[j].value < newValue) ||
              (insertionSubtree[j].nextValue == 0n && insertionSubtree[j].nextIndex == 0n)) {

              insertionSubtree[j].nextIndex = startInsertionIndex + BigInt(i);
              insertionSubtree[j].nextValue = newValue;
          }
      }
      }
    }

    // For each calculated new leaf, we insert it into the tree at the next position
    for (let i = 0 ; i < leaves.length; i++) {
      // TODO: can we skip inserting the empty values
      this.cachedLeaves[Number(startInsertionIndex)+i] = insertionSubtree[i];
      await this.underlying.appendLeaves([hashEncodedTreeValue(insertionSubtree[i], this.hasher)]);
    }

    return lowNullifierWitnesses;
  }

  

  /**
   * Commits the changes to the database.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    await this.underlying.commit();
    await this.commitLeaves();
  }

  /**
   * Rolls back the not-yet-committed changes.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    await this.underlying.rollback();
    this.rollbackLeaves();
  }

  /**
   * Returns a sibling path for the element at the given index.
   * @param index - The index of the element.
   * @returns A sibling path for the element at the given index.
   * Note: The sibling path is an array of sibling hashes, with the lowest hash (leaf hash) first, and the highest hash last.
   */
  public async getSiblingPath(index: bigint, includeUncommitted: boolean): Promise<SiblingPath> {
    return await this.underlying.getSiblingPath(index, includeUncommitted);
  }

  /**
   * Appends the given leaf to the tree.
   * @param leaf - The leaf to append.
   * @returns Empty promise.
   */
  private async appendLeaf(leaf: Buffer): Promise<void> {
    const newValue = toBigIntBE(leaf);
    const indexOfPrevious = this.findIndexOfPreviousValue(newValue, true);
    const previousLeafCopy = this.getLatestLeafDataCopy(indexOfPrevious.index, true);
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
    const currentSize = this.underlying.getNumLeaves(true);
    previousLeafCopy.nextIndex = BigInt(currentSize);
    previousLeafCopy.nextValue = newLeaf.value;
    this.cachedLeaves[Number(currentSize)] = newLeaf;
    this.cachedLeaves[Number(indexOfPrevious.index)] = previousLeafCopy;
    await this.underlying.updateLeaf(
      hashEncodedTreeValue(previousLeafCopy, this.hasher),
      BigInt(indexOfPrevious.index),
    );
    await this.underlying.appendLeaves([hashEncodedTreeValue(newLeaf, this.hasher)]);
  }

  /**
   * Finds the index of the largest leaf whose value is less than or equal to the provided value.
   * @param newValue - The new value to be inserted into the tree.
   * @returns Tuple containing the leaf index and a flag to say if the value is a duplicate.
   */
  public findIndexOfPreviousValue(newValue: bigint, includeUncommitted: boolean) {
    const numLeaves = this.underlying.getNumLeaves(includeUncommitted);
    const diff: bigint[] = [];
    for (let i = 0; i < numLeaves; i++) {
      const storedLeaf = this.getLatestLeafDataCopy(i, includeUncommitted)!;
      if (storedLeaf.value > newValue) {
        diff.push(newValue);
      } else if (storedLeaf.value === newValue) {
        return { index: i, alreadyPresent: true };
      } else {
        diff.push(newValue - storedLeaf.value);
      }
    }
    const minIndex = this.findMinIndex(diff);
    return { index: minIndex, alreadyPresent: false };
  }

  /**
   * Finds the index of the minimum value in an array.
   * @param values - The collection of values to be searched.
   * @returns The index of the minimum value in the array.
   */
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

  /**
   * Saves the initial leaf to this object and saves it to a database.
   */
  private async init() {
    // TODO: increase the initial size of the tree to the size of a full rollup insertion - change reflected in c++ to allow subtree insertion

    this.leaves.push(initialLeaf);
    await this.underlying.appendLeaves([hashEncodedTreeValue(initialLeaf, this.hasher)]);
    await this.commit();
  }

  /**
   * Loads Merkle tree data from a database and assigns them to this object.
   * @param startingIndex - An index locating a first element of the tree.
   */
  private async initFromDb(startingIndex = 0n): Promise<void> {
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

  /**
   * Commits all the leaves to the database and removes them from a cache.
   */
  private async commitLeaves(): Promise<void> {
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

  /**
   * Wipes all the leaves in a cache.
   */
  private rollbackLeaves() {
    this.clearCache();
  }

  /**
   * Clears the cache.
   */
  private clearCache() {
    this.cachedLeaves = {};
  }

  /**
   * Gets the latest LeafData copy.
   * @param index - Index of the leaf of which to obtain the LeafData copy.
   * @returns A copy of the leaf data at the given index or undefined if the leaf was not found.
   */
  public getLatestLeafDataCopy(index: number, includeUncommitted: boolean): LeafData | undefined {
    const leaf = !includeUncommitted ? this.leaves[index] : this.cachedLeaves[index] ?? this.leaves[index];
    return leaf
      ? ({
          value: leaf.value,
          nextIndex: leaf.nextIndex,
          nextValue: leaf.nextValue,
        } as LeafData)
      : undefined;
  }

  public getLeafValue(index: bigint, includeUncommitted: boolean): Promise<Buffer | undefined> {
    const leaf = this.getLatestLeafDataCopy(Number(index), includeUncommitted);
    if (!leaf) return Promise.resolve(undefined);
    return Promise.resolve(toBufferBE(leaf.value, 32));
  }
}
