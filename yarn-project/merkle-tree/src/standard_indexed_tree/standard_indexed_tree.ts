import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { createDebugLogger } from '@aztec/foundation/log';
import { Hasher, IndexedTreeLeaf, IndexedTreeLeafPreimage, SiblingPath } from '@aztec/types';

import { LevelUp } from 'levelup';

import { BatchInsertionResult, IndexedTree, LowLeafWitnessData } from '../index.js';
import { TreeBase } from '../tree_base.js';

const log = createDebugLogger('aztec:standard-indexed-tree');

/* eslint-disable */

// TODO

/**
 * Pre-compute empty witness.
 * @param treeHeight - Height of tree for sibling path.
 * @returns An empty witness.
 */
function getEmptyLowLeafWitness<N extends number, Leaf extends IndexedTreeLeaf>(
  treeHeight: N,
  preimageFactory: Empty<IndexedTreeLeafPreimage<Leaf>>,
): LowLeafWitnessData<N, Leaf> {
  return {
    leafData: preimageFactory.empty(),
    index: 0n,
    siblingPath: new SiblingPath(treeHeight, Array(treeHeight).fill(toBufferBE(0n, 32))),
  };
}

interface Empty<T> {
  empty(): T;
}

interface DummyBuilder<T> {
  buildDummy(key: bigint): T;
}

interface FromBuffer<T> {
  fromBuffer(buffer: Buffer): T;
}

interface PreimageFactory<T extends IndexedTreeLeaf> {
  fromLeaf(leaf: T, nextKey: bigint, nextIndex: bigint): IndexedTreeLeafPreimage<T>;
}

const leafKeyToDbKey = (name: string, key: bigint) => {
  return `${name}:leaf:${toBufferBE(key, 32).toString('hex')}`;
};

const dbKeyToLeafKey = (key: string): bigint => {
  const index = key.split(':')[2];
  return toBigIntBE(Buffer.from(index, 'hex'));
};

export class StandardIndexedTree<Leaf extends IndexedTreeLeaf> extends TreeBase implements IndexedTree<Leaf> {
  protected leafPreimages: IndexedTreeLeafPreimage<Leaf>[] = [];
  protected cachedLeafPreimages: { [key: number]: IndexedTreeLeafPreimage<Leaf> } = {};

  public constructor(
    db: LevelUp,
    hasher: Hasher,
    name: string,
    depth: number,
    size: bigint = 0n,
    protected leafPreimageFactory: FromBuffer<IndexedTreeLeafPreimage<Leaf>> &
      Empty<IndexedTreeLeafPreimage<Leaf>> &
      PreimageFactory<Leaf>,
    protected leafFactory: FromBuffer<Leaf> & DummyBuilder<Leaf>,
    root?: Buffer,
  ) {
    super(db, hasher, name, depth, size, root);
  }

  /**
   * Appends a set of leaf values to the tree.
   * @param leaves - The set of leaves to be appended.
   */
  appendLeaves(leaves: Buffer[]): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Commits the changes to the database.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    await super.commit();
    await this.commitLeaves();
  }

  /**
   * Rolls back the not-yet-committed changes.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    await super.rollback();
    this.clearCachedLeaves();
  }

  /**
   * Gets the value of the leaf at the given index.
   * @param index - Index of the leaf of which to obtain the value.
   * @param includeUncommitted - Indicates whether to include uncommitted leaves in the computation.
   * @returns The value of the leaf at the given index or undefined if the leaf is empty.
   */
  public getLeafValue(index: bigint, includeUncommitted: boolean): Promise<Buffer | undefined> {
    const leaf = this.getLatestLeafPreimageCopy(Number(index), includeUncommitted);
    if (!leaf) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(leaf.toBuffer());
  }

  /**
   * Finds the index of the largest leaf whose value is less than or equal to the provided value.
   * @param newValue - The new value to be inserted into the tree.
   * @param includeUncommitted - If true, the uncommitted changes are included in the search.
   * @returns The found leaf index and a flag indicating if the corresponding leaf's value is equal to `newValue`.
   */
  findIndexOfPreviousKey(
    newValue: bigint,
    includeUncommitted: boolean,
  ): {
    /**
     * The index of the found leaf.
     */
    index: number;
    /**
     * A flag indicating if the corresponding leaf's value is equal to `newValue`.
     */
    alreadyPresent: boolean;
  } {
    const numLeaves = this.getNumLeaves(includeUncommitted);
    const diff: bigint[] = [];

    for (let i = 0; i < numLeaves; i++) {
      const storedPreimage = this.getLatestLeafPreimageCopy(i, includeUncommitted);

      // The stored leaf can be undefined if it addresses an empty leaf
      // If the leaf is empty we do the same as if the leaf was larger
      if (storedPreimage === undefined) {
        diff.push(newValue);
      } else if (storedPreimage.key > newValue) {
        diff.push(newValue);
      } else if (storedPreimage.key === newValue) {
        return { index: i, alreadyPresent: true };
      } else {
        diff.push(newValue - storedPreimage.key);
      }
    }
    const minIndex = this.findMinKey(diff);
    return { index: minIndex, alreadyPresent: false };
  }

  /**
   * Gets the latest LeafPreimage copy.
   * @param index - Index of the leaf of which to obtain the LeafPreimage copy.
   * @param includeUncommitted - If true, the uncommitted changes are included in the search.
   * @returns A copy of the leaf preimage at the given index or undefined if the leaf was not found.
   */
  public getLatestLeafPreimageCopy(
    index: number,
    includeUncommitted: boolean,
  ): IndexedTreeLeafPreimage<Leaf> | undefined {
    const preimage = !includeUncommitted
      ? this.leafPreimages[index]
      : this.cachedLeafPreimages[index] ?? this.leafPreimages[index];
    return preimage?.clone();
  }

  /**
   * Finds the index of the minimum value in an array.
   * @param values - The collection of values to be searched.
   * @returns The index of the minimum value in the array.
   */
  private findMinKey(values: bigint[]) {
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
   * Initializes the tree.
   * @param prefilledSize - A number of leaves that are prefilled with values.
   * @returns Empty promise.
   *
   * @remarks Explanation of pre-filling:
   *    There needs to be an initial (0,0,0) leaf in the tree, so that when we insert the first 'proper' leaf, we can
   *    prove that any value greater than 0 doesn't exist in the tree yet. We prefill/pad the tree with "the number of
   *    leaves that are added by one block" so that the first 'proper' block can insert a full subtree.
   *
   *    Without this padding, there would be a leaf (0,0,0) at leaf index 0, making it really difficult to insert e.g.
   *    1024 leaves for the first block, because there's only neat space for 1023 leaves after 0. By padding with 1023
   *    more leaves, we can then insert the first block of 1024 leaves into indices 1024:2047.
   */
  public async init(prefilledSize: number): Promise<void> {
    if (prefilledSize < 1) {
      throw new Error(`Prefilled size must be at least 1!`);
    }

    const leaves: IndexedTreeLeafPreimage<Leaf>[] = [];
    for (let i = 0n; i < prefilledSize; i++) {
      const newLeaf = this.leafFactory.buildDummy(toBigIntBE(Buffer.from([Number(i)])));
      const newLeafPreimage = this.leafPreimageFactory.fromLeaf(newLeaf, i + 1n, i + 1n);
      leaves.push(newLeafPreimage);
    }

    // Make the first leaf have 0 key
    leaves[0].key = 0n;

    // Make the last leaf point to the first leaf
    leaves[prefilledSize - 1].nextIndex = 0n;
    leaves[prefilledSize - 1].nextKey = 0n;

    await this.encodeAndAppendLeaves(leaves, true);
    await this.commit();
  }

  /**
   * Loads Merkle tree data from a database and assigns them to this object.
   */
  public async initFromDb(): Promise<void> {
    const startingIndex = 0n;
    const preimages: IndexedTreeLeafPreimage<Leaf>[] = [];
    const promise = new Promise<void>((resolve, reject) => {
      this.db
        .createReadStream({
          gte: leafKeyToDbKey(this.getName(), startingIndex),
          lte: leafKeyToDbKey(this.getName(), 2n ** BigInt(this.getDepth())),
        })
        .on('data', data => {
          const leafKey = dbKeyToLeafKey(data.key.toString('utf-8'));
          preimages[Number(leafKey)] = this.leafPreimageFactory.fromBuffer(data.value);
        })
        .on('close', function () {})
        .on('end', function () {
          resolve();
        })
        .on('error', function () {
          log.error('stream error');
          reject();
        });
    });
    await promise;
    this.leafPreimages = preimages;
  }

  /**
   * Commits all the leaves to the database and removes them from a cache.
   */
  private async commitLeaves(): Promise<void> {
    const batch = this.db.batch();
    const keys = Object.getOwnPropertyNames(this.cachedLeafPreimages);
    for (const key of keys) {
      const index = Number(key);
      batch.put(leafKeyToDbKey(this.getName(), BigInt(index)), this.cachedLeafPreimages[index].toBuffer());
      this.leafPreimages[index] = this.cachedLeafPreimages[index];
    }
    await batch.write();
    this.clearCachedLeaves();
  }

  /**
   * Clears the cache.
   */
  private clearCachedLeaves() {
    this.cachedLeafPreimages = {};
  }

  /**
   * Updates a leaf in the tree.
   * @param preimage - New contents of the leaf.
   * @param index - Index of the leaf to be updated.
   */
  protected async updateLeaf(preimage: IndexedTreeLeafPreimage<Leaf>, index: bigint) {
    if (index > this.maxIndex) {
      throw Error(`Index out of bounds. Index ${index}, max index: ${this.maxIndex}.`);
    }

    const encodedLeaf = this.encodeLeaf(preimage, true);
    await this.addLeafToCacheAndHashToRoot(encodedLeaf, index);
    const numLeaves = this.getNumLeaves(true);
    if (index >= numLeaves) {
      this.cachedSize = index + 1n;
    }
  }

  /* eslint-disable jsdoc/require-description-complete-sentence */
  /* The following doc block messes up with complete-sentence, so we just disable it */

  /**
   *
   * Each base rollup needs to provide non membership / inclusion proofs for each of the nullifier.
   * This method will return membership proofs and perform partial node updates that will
   * allow the circuit to incrementally update the tree and perform a batch insertion.
   *
   * This offers massive circuit performance savings over doing incremental insertions.
   *
   * WARNING: This function has side effects, it will insert values into the tree.
   *
   * Assumptions:
   * 1. There are 8 nullifiers provided and they are either unique or empty. (denoted as 0)
   * 2. If kc 0 has 1 nullifier, and kc 1 has 3 nullifiers the layout will assume to be the sparse
   *   nullifier layout: [kc0-0, 0, 0, 0, kc1-0, kc1-1, kc1-2, 0]
   *
   * Algorithm overview
   *
   * In general, if we want to batch insert items, we first need to update their low nullifier to point to them,
   * then batch insert all of the values at once in the final step.
   * To update a low nullifier, we provide an insertion proof that the low nullifier currently exists to the
   * circuit, then update the low nullifier.
   * Updating this low nullifier will in turn change the root of the tree. Therefore future low nullifier insertion proofs
   * must be given against this new root.
   * As a result, each low nullifier membership proof will be provided against an intermediate tree state, each with differing
   * roots.
   *
   * This become tricky when two items that are being batch inserted need to update the same low nullifier, or need to use
   * a value that is part of the same batch insertion as their low nullifier. What we do to avoid this case is to
   * update the existing leaves in the tree with the nullifiers in high to low order, ensuring that this case never occurs.
   * The circuit has to sort the nullifiers (or take a hint of the sorted nullifiers and prove that it's a valid permutation).
   * Then we just batch insert the new nullifiers in the original order.
   *
   * The following example will illustrate attempting to insert 2,3,20,19 into a tree already containing 0,5,10,15
   *
   * The example will explore two cases. In each case the values low nullifier will exist within the batch insertion,
   * One where the low nullifier comes before the item in the set (2,3), and one where it comes after (20,19).
   *
   * First, we sort the nullifiers high to low, that's 20,19,3,2
   *
   * The original tree:                       Pending insertion subtree
   *
   *  index     0       1       2       3         -       -       -       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         -       -       -       -
   *  nextIdx   1       2       3       0         -       -       -       -
   *  nextVal   5      10      15       0         -       -       -       -
   *
   *
   * Inserting 20:
   * 1. Find the low nullifier (3) - provide inclusion proof
   * 2. Update its pointers
   * 3. Insert 20 into the pending subtree
   *
   *  index     0       1       2       3         -       -       6       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         -       -      20       -
   *  nextIdx   1       2       3       6         -       -       0       -
   *  nextVal   5      10      15      20         -       -       0       -
   *
   * Inserting 19:
   * 1. Find the low nullifier (3) - provide inclusion proof
   * 2. Update its pointers
   * 3. Insert 19 into the pending subtree
   *
   *  index     0       1       2       3         -       -       6       7
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         -       -      20      19
   *  nextIdx   1       2       3       7         -       -       0       6
   *  nextVal   5      10      15      19         -       -       0      20
   *
   * Inserting 3:
   * 1. Find the low nullifier (0) - provide inclusion proof
   * 2. Update its pointers
   * 3. Insert 3 into the pending subtree
   *
   *  index     0       1       2       3         -       5       6       7
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         -       3      20      19
   *  nextIdx   5       2       3       7         -       1       0       6
   *  nextVal   3      10      15      19         -       5       0      20
   *
   * Inserting 2:
   * 1. Find the low nullifier (0) - provide inclusion proof
   * 2. Update its pointers
   * 3. Insert 2 into the pending subtree
   *
   *  index     0       1       2       3         4       5       6       7
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         2       3      20      19
   *  nextIdx   4       2       3       7         5       1       0       6
   *  nextVal   2      10      15      19         3       5       0      20
   *
   * Perform subtree insertion
   *
   *  index     0       1       2       3       4       5       6       7
   *  ---------------------------------------------------------------------
   *  val       0       5      10      15       2       3      20      19
   *  nextIdx   4       2       3       7       5       1       0       6
   *  nextVal   2      10      15      19       3       5       0      20
   *
   * TODO: this implementation will change once the zero value is changed from h(0,0,0). Changes incoming over the next sprint
   * @param leaves - Values to insert into the tree.
   * @param subtreeHeight - Height of the subtree.
   * @returns The data for the leaves to be updated when inserting the new ones.
   */
  public async batchInsert<
    TreeHeight extends number,
    SubtreeHeight extends number,
    SubtreeSiblingPathHeight extends number,
  >(
    leaves: Buffer[],
    subtreeHeight: SubtreeHeight,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight, Leaf>> {
    const emptyLowLeafWitness = getEmptyLowLeafWitness(this.getDepth() as TreeHeight, this.leafPreimageFactory);
    // Accumulators
    const lowLeavesWitnesses: LowLeafWitnessData<TreeHeight, Leaf>[] = leaves.map(() => emptyLowLeafWitness);
    const pendingInsertionSubtree: IndexedTreeLeafPreimage<Leaf>[] = leaves.map(() => this.leafPreimageFactory.empty());

    // Start info
    const startInsertionIndex = this.getNumLeaves(true);

    const leavesToInsert = leaves.map(leaf => this.leafFactory.fromBuffer(leaf));
    const sortedDescendingLeafTuples = leavesToInsert
      .map((leaf, index) => ({ leaf, index }))
      .sort((a, b) => Number(b.leaf.getKey() - a.leaf.getKey()));
    const sortedDescendingLeaves = sortedDescendingLeafTuples.map(leafTuple => leafTuple.leaf);

    // Get insertion path for each leaf
    for (let i = 0; i < leavesToInsert.length; i++) {
      const newLeaf = sortedDescendingLeaves[i];
      const originalIndex = leavesToInsert.indexOf(newLeaf);

      if (newLeaf.isEmpty()) {
        continue;
      }

      const indexOfPrevious = this.findIndexOfPreviousKey(newLeaf.getKey(), true);

      // get the low leaf
      const lowLeafPreimage = this.getLatestLeafPreimageCopy(indexOfPrevious.index, true);
      if (lowLeafPreimage === undefined) {
        return {
          lowLeavesWitnessData: undefined,
          sortedNewLeaves: sortedDescendingLeafTuples.map(leafTuple => leafTuple.leaf.toBuffer()),
          sortedNewLeavesIndexes: sortedDescendingLeafTuples.map(leafTuple => leafTuple.index),
          newSubtreeSiblingPath: await this.getSubtreeSiblingPath(subtreeHeight, true),
        };
      }
      const siblingPath = await this.getSiblingPath<TreeHeight>(BigInt(indexOfPrevious.index), true);

      const witness: LowLeafWitnessData<TreeHeight, Leaf> = {
        leafData: lowLeafPreimage.clone(),
        index: BigInt(indexOfPrevious.index),
        siblingPath,
      };

      // Update the running paths
      lowLeavesWitnesses[i] = witness;

      const currentPendingPreimageLeaf = this.leafPreimageFactory.fromLeaf(
        newLeaf,
        lowLeafPreimage.nextKey,
        lowLeafPreimage.nextIndex,
      );

      pendingInsertionSubtree[originalIndex] = currentPendingPreimageLeaf;

      lowLeafPreimage.nextKey = newLeaf.getKey();
      lowLeafPreimage.nextIndex = startInsertionIndex + BigInt(originalIndex);

      const lowLeafIndex = indexOfPrevious.index;
      this.cachedLeafPreimages[lowLeafIndex] = lowLeafPreimage;
      await this.updateLeaf(lowLeafPreimage, BigInt(lowLeafIndex));
    }

    const newSubtreeSiblingPath = await this.getSubtreeSiblingPath<SubtreeHeight, SubtreeSiblingPathHeight>(
      subtreeHeight,
      true,
    );

    // Perform batch insertion of new pending values
    // Note: In this case we set `hash0Leaf` param to false because batch insertion algorithm use forced null leaf
    // inclusion. See {@link encodeLeaf} for  a more through param explanation.
    await this.encodeAndAppendLeaves(pendingInsertionSubtree, false);

    return {
      lowLeavesWitnessData: lowLeavesWitnesses,
      sortedNewLeaves: sortedDescendingLeafTuples.map(leafTuple => leafTuple.leaf.toBuffer()),
      sortedNewLeavesIndexes: sortedDescendingLeafTuples.map(leafTuple => leafTuple.index),
      newSubtreeSiblingPath,
    };
  }

  async getSubtreeSiblingPath<SubtreeHeight extends number, SubtreeSiblingPathHeight extends number>(
    subtreeHeight: SubtreeHeight,
    includeUncommitted: boolean,
  ): Promise<SiblingPath<SubtreeSiblingPathHeight>> {
    const nextAvailableLeafIndex = this.getNumLeaves(includeUncommitted);
    const fullSiblingPath = await this.getSiblingPath(nextAvailableLeafIndex, includeUncommitted);

    // Drop the first subtreeHeight items since we only care about the path to the subtree root
    return fullSiblingPath.getSubtreeSiblingPath(subtreeHeight);
  }

  /**
   * Encodes leaves and appends them to a tree.
   * @param preimages - Leaves to encode.
   * @param hash0Leaf - Indicates whether 0 value leaf should be hashed. See {@link encodeLeaf}.
   * @returns Empty promise
   */
  private async encodeAndAppendLeaves(preimages: IndexedTreeLeafPreimage<Leaf>[], hash0Leaf: boolean): Promise<void> {
    const startInsertionIndex = Number(this.getNumLeaves(true));

    const hashedLeaves = preimages.map((preimage, i) => {
      this.cachedLeafPreimages[startInsertionIndex + i] = preimage;
      return this.encodeLeaf(preimage, hash0Leaf);
    });

    await super.appendLeaves(hashedLeaves);
  }

  /**
   * Encode a leaf into a buffer.
   * @param leaf - Leaf to encode.
   * @param hash0Leaf - Indicates whether 0 value leaf should be hashed. Not hashing 0 value can represent a forced
   *                    null leaf insertion. Detecting this case by checking for 0 value is safe as in the case of
   *                    nullifier it is improbable that a valid nullifier would be 0.
   * @returns Leaf encoded in a buffer.
   */
  private encodeLeaf(leaf: IndexedTreeLeafPreimage<Leaf>, hash0Leaf: boolean): Buffer {
    let encodedLeaf;
    if (!hash0Leaf && leaf.key == 0n) {
      encodedLeaf = toBufferBE(0n, 32);
    } else {
      encodedLeaf = this.hasher.hashInputs(leaf.toHashInputs());
    }
    return encodedLeaf;
  }
}
