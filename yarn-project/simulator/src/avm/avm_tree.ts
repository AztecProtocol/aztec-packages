import { type IndexedTreeId, MerkleTreeId, type MerkleTreeReadOperations, getTreeHeight } from '@aztec/circuit-types';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type IndexedTreeLeafPreimage, type TreeLeafPreimage } from '@aztec/foundation/trees';

import cloneDeep from 'lodash.clonedeep';

/****************************************************/
/****** Structs Used by the AvmEphemeralForest ******/
/****************************************************/

/**
 * The preimage and the leaf index of the Low Leaf (Low Nullifier or Low Public Data Leaf)
 */
type PreimageWitness<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  index: bigint;
  update: boolean;
};

/**
 * Contains the low sibling path and a boolean if the next index pointed to
 * by the low leaf is an update or an insertion (i.e. exists or not).
 */
type LeafWitness<T extends IndexedTreeLeafPreimage> = PreimageWitness<T> & {
  siblingPath: Fr[];
};

/**
 * The result of an indexed insertion in an indexed merkle tree.
 * This will be used to hint the circuit
 */
export type IndexedInsertionResult<T extends IndexedTreeLeafPreimage> = {
  leafIndex: bigint;
  insertionPath: Fr[];
  newOrElementToUpdate: { update: boolean; element: T };
  lowWitness: LeafWitness<T>;
};

/****************************************************/
/****** The AvmEphemeralForest Class ****************/
/****************************************************/

/**
 * This provides a forkable abstraction over the EphemeralAvmTree class
 *  It contains the logic to look up into a read-only MerkleTreeDb to discover
 *  the sibling paths and low witnesses that weren't inserted as part of this tx
 */
export class AvmEphemeralForest {
  constructor(
    public treeDb: MerkleTreeReadOperations,
    public treeMap: Map<MerkleTreeId, EphemeralAvmTree>,
    // This contains the [leaf index,indexed leaf preimages] tuple that were updated or inserted in the ephemeral tree
    // This is needed since we have a sparse collection of keys sorted leaves in the ephemeral tree
    public indexedUpdates: Map<IndexedTreeId, Map<bigint, IndexedTreeLeafPreimage>>,
    public indexedSortedKeys: Map<IndexedTreeId, [Fr, bigint][]>,
  ) {}

  static async create(treeDb: MerkleTreeReadOperations): Promise<AvmEphemeralForest> {
    const treeMap = new Map<MerkleTreeId, EphemeralAvmTree>();
    for (const treeType of [MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.PUBLIC_DATA_TREE]) {
      const treeInfo = await treeDb.getTreeInfo(treeType);
      const tree = await EphemeralAvmTree.create(treeInfo.size, treeInfo.depth, treeDb, treeType);
      treeMap.set(treeType, tree);
    }
    const indexedSortedKeys = new Map<IndexedTreeId, [Fr, bigint][]>();
    indexedSortedKeys.set(MerkleTreeId.NULLIFIER_TREE as IndexedTreeId, []);
    indexedSortedKeys.set(MerkleTreeId.PUBLIC_DATA_TREE as IndexedTreeId, []);
    return new AvmEphemeralForest(treeDb, treeMap, new Map(), indexedSortedKeys);
  }

  fork(): AvmEphemeralForest {
    return new AvmEphemeralForest(
      this.treeDb,
      cloneDeep(this.treeMap),
      cloneDeep(this.indexedUpdates),
      cloneDeep(this.indexedSortedKeys),
    );
  }

  /**
   * Gets sibling path for a leaf - if the sibling path is not found in the tree, it is fetched from the DB
   * @param treeId - The tree to be queried for a sibling path.
   * @param index - The index of the leaf for which a sibling path should be returned.
   * @returns The sibling path of the leaf.
   */
  async getSiblingPath(treeId: MerkleTreeId, index: bigint): Promise<Fr[]> {
    const tree = this.treeMap.get(treeId)!;
    let path = await tree.getSiblingPath(index);
    if (path === undefined) {
      // We dont have the sibling path in our tree - we have to get it from the DB
      path = (await this.treeDb.getSiblingPath(treeId, index)).toFields();
      // Since the sibling path could be outdated, we compare it with nodes in our tree
      // if we encounter a mismatch, we replace it with the node we found in our tree.
      for (let i = 0; i < path.length; i++) {
        const siblingIndex = index ^ 1n;
        const node = await tree.getNode(siblingIndex, tree.depth - i);
        if (node !== undefined) {
          const nodeHash = await tree.hashTree(node, i + 1);
          if (!nodeHash.equals(path[i])) {
            path[i] = nodeHash;
          }
        }
        index >>= 1n;
      }
    }
    return path;
  }

  /**
   * This does the work of appending the new leaf and updating the low witness
   * @param treeId - The tree to be queried for a sibling path.
   * @param lowWitnessIndex - The index of the low leaf in the tree.
   * @param lowWitness - The preimage of the low leaf.
   * @param newLeafPreimage - The preimage of the new leaf to be inserted.
   * @returns The sibling path of the new leaf (i.e. the insertion path)
   */
  async appendIndexedTree<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    lowLeafIndex: bigint,
    lowLeafPreimage: T,
    newLeafPreimage: T,
  ): Promise<Fr[]> {
    const tree = this.treeMap.get(treeId)!;
    const newLeaf = await this.hashPreimage(newLeafPreimage);
    const insertIndex = tree.leafCount;

    const lowLeaf = await this.hashPreimage(lowLeafPreimage);
    // Update the low nullifier hash
    this.setIndexedUpdates(treeId, lowLeafIndex, lowLeafPreimage);
    await tree.updateLeaf(lowLeaf, lowLeafIndex);
    // Append the new leaf
    await tree.appendLeaf(newLeaf);
    await this.setIndexedUpdates(treeId, insertIndex, newLeafPreimage);

    return (await tree.getSiblingPath(insertIndex))!;
  }

  /**
   * This writes or updates a slot in the public data tree with a value
   * @param slot - The slot to be written to.
   * @param newValue - The value to be written or updated to
   * @returns The insertion result which contains the insertion path, low leaf and the new leaf index
   */
  async writePublicStorage(slot: Fr, newValue: Fr): Promise<IndexedInsertionResult<PublicDataTreeLeafPreimage>> {
    // This only works for the public data tree
    const treeId = MerkleTreeId.PUBLIC_DATA_TREE;
    const tree = this.treeMap.get(treeId)!;
    const { preimage, index, update }: PreimageWitness<PublicDataTreeLeafPreimage> = await this.getLeafOrLowLeafInfo(
      treeId,
      slot,
    );
    const siblingPath = await this.getSiblingPath(treeId, index);
    if (update) {
      const updatedPreimage = cloneDeep(preimage);
      const existingPublicDataSiblingPath = siblingPath;
      updatedPreimage.value = newValue;

      // It is really unintuitive that by updating, we are also appending a Zero Leaf to the tree
      // Additionally, this leaf preimage does not seem to factor into further appends
      const emptyLeaf = new PublicDataTreeLeafPreimage(Fr.ZERO, Fr.ZERO, Fr.ZERO, 0n);
      const insertionIndex = tree.leafCount;
      await tree.updateLeaf(await this.hashPreimage(updatedPreimage), index);
      await tree.appendLeaf(Fr.ZERO);
      this.setIndexedUpdates(treeId, index, updatedPreimage);
      this.setIndexedUpdates(treeId, insertionIndex, emptyLeaf);
      const insertionPath = (await tree.getSiblingPath(insertionIndex))!;

      // Even though we append an empty leaf into the tree as a part of update - it doesnt seem to impact future inserts...
      this._updateSortedKeys(treeId, [updatedPreimage.slot], [index]);

      return {
        leafIndex: insertionIndex,
        insertionPath,
        newOrElementToUpdate: { update: true, element: updatedPreimage },
        lowWitness: {
          preimage: preimage,
          index: index,
          update: true,
          siblingPath: existingPublicDataSiblingPath,
        },
      };
    }
    // We are writing to a new slot, so our preimage is a lowNullifier
    const insertionIndex = tree.leafCount;
    const updatedLowLeaf = cloneDeep(preimage);
    updatedLowLeaf.nextSlot = slot;
    updatedLowLeaf.nextIndex = insertionIndex;

    const newPublicDataLeaf = new PublicDataTreeLeafPreimage(
      slot,
      newValue,
      new Fr(preimage.getNextKey()),
      preimage.getNextIndex(),
    );
    const insertionPath = await this.appendIndexedTree(treeId, index, updatedLowLeaf, newPublicDataLeaf);

    // Even though the low leaf key is not updated, we still need to update the sorted keys in case we have
    // not seen the low leaf before
    this._updateSortedKeys(treeId, [newPublicDataLeaf.slot, updatedLowLeaf.slot], [insertionIndex, index]);

    return {
      leafIndex: insertionIndex,
      insertionPath: insertionPath,
      newOrElementToUpdate: { update: false, element: newPublicDataLeaf },
      lowWitness: {
        preimage,
        index: index,
        update: false,
        siblingPath,
      },
    };
  }

  private _updateSortedKeys(treeId: IndexedTreeId, keys: Fr[], index: bigint[]): void {
    // This is a reference
    const existingKeyVector = this.indexedSortedKeys.get(treeId)!;
    // Should already be sorted so not need to re-sort if we just update or splice
    for (let i = 0; i < keys.length; i++) {
      const foundIndex = existingKeyVector.findIndex(x => x[1] === index[i]);
      if (foundIndex === -1) {
        // New element, we splice it into the correct location
        const spliceIndex =
          this.searchForKey(
            keys[i],
            existingKeyVector.map(x => x[0]),
          ) + 1;
        existingKeyVector.splice(spliceIndex, 0, [keys[i], index[i]]);
      } else {
        // Update the existing element
        existingKeyVector[foundIndex][0] = keys[i];
      }
    }
  }

  /**
   * This appends a nullifier to the nullifier tree, and throws if the nullifier already exists
   * @param value - The nullifier to be appended
   * @returns The insertion result which contains the insertion path, low leaf and the new leaf index
   */
  async appendNullifier(nullifier: Fr): Promise<IndexedInsertionResult<NullifierLeafPreimage>> {
    const treeId = MerkleTreeId.NULLIFIER_TREE;
    const tree = this.treeMap.get(treeId)!;
    const { preimage, index, update }: PreimageWitness<NullifierLeafPreimage> = await this.getLeafOrLowLeafInfo(
      treeId,
      nullifier,
    );
    const siblingPath = await this.getSiblingPath(treeId, index);

    if (update) {
      throw new Error('Not allowed to update a nullifier');
    }
    // We are writing a new entry
    const insertionIndex = tree.leafCount;
    const updatedLowNullifier = cloneDeep(preimage);
    updatedLowNullifier.nextNullifier = nullifier;
    updatedLowNullifier.nextIndex = insertionIndex;

    const newNullifierLeaf = new NullifierLeafPreimage(nullifier, preimage.nextNullifier, preimage.nextIndex);
    const insertionPath = await this.appendIndexedTree(treeId, index, updatedLowNullifier, newNullifierLeaf);

    // Even though the low nullifier key is not updated, we still need to update the sorted keys in case we have
    // not seen the low nullifier before
    this._updateSortedKeys(
      treeId,
      [newNullifierLeaf.nullifier, updatedLowNullifier.nullifier],
      [insertionIndex, index],
    );

    return {
      leafIndex: insertionIndex,
      insertionPath: insertionPath,
      newOrElementToUpdate: { update: false, element: newNullifierLeaf },
      lowWitness: {
        preimage,
        index,
        update,
        siblingPath,
      },
    };
  }

  /**
   * This appends a note hash to the note hash tree
   * @param value - The note hash to be appended
   * @returns The insertion result which contains the insertion path
   */
  async appendNoteHash(noteHash: Fr): Promise<Fr[]> {
    const tree = this.treeMap.get(MerkleTreeId.NOTE_HASH_TREE)!;
    await tree.appendLeaf(noteHash);
    // We use leafCount - 1 here because we would have just appended a leaf
    const insertionPath = await tree.getSiblingPath(tree.leafCount - 1n);
    return insertionPath!;
  }

  /**
   * This is wrapper around treeId to set values in the indexedUpdates map
   */
  private setIndexedUpdates<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    index: bigint,
    preimage: T,
  ): void {
    let updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      updates = new Map();
      this.indexedUpdates.set(treeId, updates);
    }
    updates.set(index, preimage);
  }

  /**
   * This is wrapper around treeId to get values in the indexedUpdates map
   */
  private getIndexedUpdates<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(treeId: ID, index: bigint): T {
    const updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      throw new Error('No updates found');
    }
    const preimage = updates.get(index);
    if (preimage === undefined) {
      throw new Error('No updates found');
    }
    return preimage as T;
  }

  /**
   * This is wrapper around treeId to check membership (i.e. has()) of index in the indexedUpdates map
   */
  private hasLocalUpdates<ID extends IndexedTreeId>(treeId: ID, index: bigint): boolean {
    const updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      return false;
    }
    return updates.has(index);
  }

  private searchForKey(key: Fr, arr: Fr[]): number {
    // We are looking for the index of the largest element in the array that is less than the key
    let start = 0;
    let end = arr.length;
    // Note that the easiest way is to increment the search key by 1 and then do a binary search
    const searchKey = key.add(Fr.ONE);
    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (arr[mid].cmp(searchKey) < 0) {
        // The key + 1 is greater than the arr element, so we can continue searching the top half
        start = mid + 1;
      } else {
        // The key + 1 is LT or EQ the arr element, so we can continue searching the bottom half
        end = mid;
      }
    }
    // We either found key + 1 or start is now at the index of the largest element that we would have inserted key + 1
    // Therefore start - 1 is the index of the element just below - note it can be -1 if the first element in the array is
    // greater than the key
    return start - 1;
  }

  /**
   * This gets the low leaf preimage and the index of the low leaf in the indexed tree given a value (slot or nullifier value)
   * If the value is not found in the tree, it does an external lookup to the merkleDB
   * @param treeId - The tree we are looking up in
   * @param key - The key for which we are look up the low leaf for.
   * @param T - The type of the preimage (PublicData or Nullifier)
   * @returns The low leaf preimage and the index of the low leaf in the indexed tree
   */
  async getLeafOrLowLeafInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    key: Fr,
  ): Promise<PreimageWitness<T>> {
    const keyOrderedVector = this.indexedSortedKeys.get(treeId)!;

    const vectorIndex = this.searchForKey(
      key,
      keyOrderedVector.map(x => x[0]),
    );
    // We have a match in our local updates
    let minPreimage = undefined;

    if (vectorIndex !== -1) {
      const [_, leafIndex] = keyOrderedVector[vectorIndex];
      minPreimage = {
        preimage: this.getIndexedUpdates(treeId, leafIndex) as T,
        index: leafIndex,
      };
    }
    // This can probably be done better, we want to say if the minInfo is undefined (because this is our first operation) we do the external lookup
    const start = minPreimage?.preimage;
    const bigIntKey = key.toBigInt();

    // If we don't have a first element or if that first element is already greater than the target key, we need to do an external lookup
    // The low public data witness is in the previous tree
    if (start === undefined || start.getKey() > key.toBigInt()) {
      // This function returns the leaf index to the actual element if it exists or the leaf index to the low leaf otherwise
      const { index, alreadyPresent } = (await this.treeDb.getPreviousValueIndex(treeId, bigIntKey))!;
      const preimage = await this.treeDb.getLeafPreimage(treeId, index);

      // Since we have never seen this before - we should insert it into our tree, as we know we will modify this leaf node
      const siblingPath = await this.getSiblingPath(treeId, index);
      // const siblingPath = (await this.treeDb.getSiblingPath(treeId, index)).toFields();

      // Is it enough to just insert the sibling path without inserting the leaf? - now probably since we will update this low nullifier index in append
      await this.treeMap.get(treeId)!.insertSiblingPath(index, siblingPath);

      const lowPublicDataPreimage = preimage as T;

      return { preimage: lowPublicDataPreimage, index: index, update: alreadyPresent };
    }

    // We look for the low element by bouncing between our local indexedUpdates map or the external DB
    // The conditions we are looking for are:
    // (1) Exact Match: curr.nextKey == key (this is only valid for public data tree)
    // (2) Sandwich Match: curr.nextKey > key and curr.key < key
    // (3) Max Condition: curr.next_index == 0 and curr.key < key
    // Note the min condition does not need to be handled since indexed trees are prefilled with at least the 0 element
    let found = false;
    let curr = minPreimage!.preimage as T;
    let result: PreimageWitness<T> | undefined = undefined;
    // Temp to avoid infinite loops - the limit is the number of leaves we may have to read
    const LIMIT = 2n ** BigInt(getTreeHeight(treeId)) - 1n;
    let counter = 0n;
    let lowPublicDataIndex = minPreimage!.index;
    while (!found && counter < LIMIT) {
      if (curr.getKey() === bigIntKey) {
        // We found an exact match - therefore this is an update
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex, update: true };
      } else if (curr.getKey() < bigIntKey && (curr.getNextIndex() === 0n || curr.getNextKey() > bigIntKey)) {
        // We found it via sandwich or max condition, this is a low nullifier
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex, update: false };
      }
      // Update the the values for the next iteration
      else {
        lowPublicDataIndex = curr.getNextIndex();
        if (this.hasLocalUpdates(treeId, lowPublicDataIndex)) {
          curr = this.getIndexedUpdates(treeId, lowPublicDataIndex)!;
        } else {
          const preimage: IndexedTreeLeafPreimage = (await this.treeDb.getLeafPreimage(treeId, lowPublicDataIndex))!;
          curr = preimage as T;
        }
      }
      counter++;
    }
    // We did not find it - this is unexpected
    if (result === undefined) {
      throw new Error('No previous value found or ran out of iterations');
    }
    return result;
  }

  /**
   * This hashes the preimage to a field element
   */
  async hashPreimage<T extends TreeLeafPreimage>(preimage: T): Promise<Fr> {
    // Watch for this edge-case, we are hashing the key=0 leaf to 0.
    // This is for backward compatibility with the world state implementation
    if (preimage.getKey() === 0n) {
      return Fr.zero();
    }
    const input = preimage.toHashInputs().map(x => Fr.fromBuffer(x));
    return await poseidon2Hash(input);
  }
}

/****************************************************/
/****** Some useful Structs and Enums **************/
/****************************************************/
enum TreeType {
  LEAF,
  NODE,
}

type Leaf = {
  tag: TreeType.LEAF;
  value: Fr;
};
type Node = {
  tag: TreeType.NODE;
  leftTree: Tree;
  rightTree: Tree;
};

type Tree = Leaf | Node;

enum SiblingStatus {
  MEMBER,
  NONMEMBER,
  ERROR,
}

type AccumulatedSiblingPath = {
  path: Fr[];
  status: SiblingStatus;
};

/****************************************************/
/****** Some Helpful Constructors for Trees  ********/
/****************************************************/
const Node = (left: Tree, right: Tree): Node => ({
  tag: TreeType.NODE,
  leftTree: left,
  rightTree: right,
});

const Leaf = (value: Fr): Leaf => ({
  tag: TreeType.LEAF,
  value,
});

/****************************************************/
/****** The EphemeralAvmTree Class *****************/
/****************************************************/

/**
 * This class contains a recursively defined tree that has leaves at different heights
 * It is seeded by an existing merkle treeDb for which it derives a frontier
 * It is intended to be a lightweight tree that contains only the necessary information to suppport appends or updates
 */
export class EphemeralAvmTree {
  private tree: Promise<Tree>;
  private readonly zeroHashes: Promise<Fr[]>;
  public frontier: Fr[];

  private constructor(public leafCount: bigint, public depth: number) {
    const result = (async () => {
      let zeroHash = Fr.zero();
      // Can probably cache this elsewhere
      const zeroHashes = [];
      for (let i = 0; i < this.depth; i++) {
        zeroHashes.push(zeroHash);
        zeroHash = await poseidon2Hash([zeroHash, zeroHash]);
      }
      return { zeroHashes, zeroHash };
    })();
    this.tree = result.then(r => Leaf(r.zeroHash));
    this.zeroHashes = result.then(r => r.zeroHashes);
    this.frontier = [];
  }

  static async create(
    forkedLeafCount: bigint,
    depth: number,
    treeDb: MerkleTreeReadOperations,
    merkleId: MerkleTreeId,
  ): Promise<EphemeralAvmTree> {
    const tree = new EphemeralAvmTree(forkedLeafCount, depth);
    await tree.initializeFrontier(treeDb, merkleId);
    return tree;
  }

  /**
   * This is a recursive function that inserts a leaf into the tree
   * @param value - The value of the leaf to be inserted
   */
  async appendLeaf(value: Fr): Promise<void> {
    const insertPath = this._derivePathLE(this.leafCount);
    this.tree = this._insertLeaf(value, insertPath, this.depth, await this.tree);
    this.leafCount++;
  }

  /**
   * This is a recursive function that upserts a leaf into the tree at a index and depth
   * @param value - The value of the leaf to be inserted
   * @param index - The index of the leaf to be inserted
   * @param depth - The depth of the leaf to be inserted (defaults to the bottom of the tree)
   */
  async updateLeaf(value: Fr, index: bigint, depth = this.depth): Promise<void> {
    const insertPath = this._derivePathLE(index, depth);
    this.tree = this._insertLeaf(value, insertPath, depth, await this.tree);
  }

  /**
   * Get the sibling path of a leaf in the tree
   * @param index - The index of the leaf for which a sibling path should be returned.
   * @returns The sibling path of the leaf, can fail if the path is not found
   */
  async getSiblingPath(index: bigint): Promise<Fr[] | undefined> {
    const searchPath = this._derivePathLE(index);
    // Handle cases where we error out
    const { path, status } = await this._getSiblingPath(searchPath, await this.tree, []);
    if (status === SiblingStatus.ERROR) {
      return undefined;
    }
    return path;
  }

  /**
   * This upserts the nodes of the sibling path into the tree
   * @param index - The index of the leaf that the sibling path is derived from
   * @param siblingPath - The sibling path of the index
   */
  async insertSiblingPath(index: bigint, siblingPath: Fr[]): Promise<void> {
    for (let i = 0; i < siblingPath.length; i++) {
      // Flip(XOR) the last bit because we are inserting siblings of the leaf
      const sibIndex = index ^ 1n;
      await this.updateLeaf(siblingPath[i], sibIndex, this.depth - i);
      index >>= 1n;
    }
  }

  /**
   * This is a helper function that computes the index of the frontier nodes at each depth
   * @param leafCount - The number of leaves in the tree
   * @returns An array of frontier indices at each depth, sorted from leaf to root
   */
  // Do we really need LeafCount to be a bigint - log2 is on numbers only
  static computeFrontierLeafIndices(leafCount: number): number[] {
    const numFrontierEntries = Math.floor(Math.log2(leafCount)) + 1;
    const frontierIndices = [];
    for (let i = 0; i < numFrontierEntries; i++) {
      if (leafCount === 0) {
        frontierIndices.push(0);
      } else if (leafCount % 2 === 0) {
        frontierIndices.push(leafCount - 2);
      } else {
        frontierIndices.push(leafCount - 1);
      }
      leafCount >>= 1;
    }
    return frontierIndices;
  }

  /**
   * This derives the frontier and inserts them into the tree
   * @param treeDb - The treeDb to be queried for sibling paths
   * @param merkleId - The treeId of the tree to be queried for sibling paths
   */
  async initializeFrontier(treeDb: MerkleTreeReadOperations, merkleId: MerkleTreeId): Promise<void> {
    // The frontier indices are sorted from the leaf to root
    const frontierIndices = EphemeralAvmTree.computeFrontierLeafIndices(Number(this.leafCount));
    // The frontier indices are level-based - i.e. index N at level L.
    // Since we can only ask the DB for paths from the root to the leaf, we do the following complicated calculations
    // 1) The goal is to insert the frontier node N at level L into the tree.
    // 2) We get the path to a leaf that passes through the frontier node we want (there are multiple paths so we just pick one)
    // 3) We can only get sibling paths from the root to the leaf, so we get the sibling path of the leaf from (2)
    // NOTE: This is terribly inefficient and we should probably change the DB API to allow for getting paths to a node

    const frontierValues = [];
    // These are leaf indexes that pass through the frontier nodes
    for (let i = 0; i < frontierIndices.length; i++) {
      // Given the index to a frontier, we first xor it so we can get its sibling index at depth L
      // We then extend the path to that sibling index by shifting left the requisite number of times (for simplicity we just go left down the tree - it doesnt matter)
      // This provides us the leaf index such that if we ask for this leafIndex's sibling path, it will pass through the frontier node
      const index = BigInt(frontierIndices[i] ^ 1) << BigInt(i);
      // This path passes through our frontier node at depth - i
      const path = await treeDb.getSiblingPath(merkleId, index);

      // We derive the path that we can walk and truncate it so that it terminates exactly at the frontier node
      const frontierPath = this._derivePathLE(BigInt(frontierIndices[i]), this.depth - i);
      // The value of the frontier is the at the i-th index of the sibling path
      const frontierValue = path.toFields()[i];
      frontierValues.push(frontierValue);
      // We insert it at depth - i (the truncated position)
      // Note this is a leaf node that wont necessarily be at the bottom of the tree (besides the first frontier)
      this.tree = this._insertLeaf(frontierValue, frontierPath, this.depth - i, await this.tree);
    }
    this.frontier = frontierValues;
  }

  /**
   * Computes the root of the tree
   */
  public async getRoot(): Promise<Fr> {
    return await this.hashTree(await this.tree, this.depth);
  }

  /**
   * Recursively hashes the subtree
   * @param tree - The tree to be hashed
   * @param depth - The depth of the tree
   */
  public async hashTree(tree: Tree, depth: number): Promise<Fr> {
    switch (tree.tag) {
      case TreeType.NODE: {
        return await poseidon2Hash([
          await this.hashTree(tree.leftTree, depth - 1),
          await this.hashTree(tree.rightTree, depth - 1),
        ]);
      }
      case TreeType.LEAF: {
        return tree.value;
      }
    }
  }

  /**
   * Extracts the subtree from a given index and depth
   * @param index - The index of the node to be extracted
   * @param depth - The depth of the node to be extracted
   * @returns The subtree rooted at the index and depth
   */
  public async getNode(index: bigint, depth: number): Promise<Tree | undefined> {
    const path = this._derivePathBE(index, depth);
    const truncatedPath = path.slice(0, depth);
    truncatedPath.reverse();
    try {
      return this._getNode(truncatedPath, await this.tree);
    } catch (e) {
      return undefined;
    }
  }

  /**
   * This is the recursive helper for getNode
   */
  private _getNode(nodePath: number[], tree: Tree): Tree {
    if (nodePath.length === 0) {
      return tree;
    }
    switch (tree.tag) {
      case TreeType.NODE:
        return nodePath.pop() === 0 ? this._getNode(nodePath, tree.leftTree) : this._getNode(nodePath, tree.rightTree);

      case TreeType.LEAF:
        throw new Error('Node not found');
    }
  }

  /** Our tree traversal uses an array of 1s and 0s to represent the path to a leaf and expects them to be in LE order
   * This helps with deriving it given an index and (optionally a depth)
   * @param index - The index to derive a path to within the tree, does not have to terminate at a leaf
   * @param depth - The depth to traverse, if not provided it will traverse to the bottom of the tree
   * @returns The path to the leaf in LE order
   */
  private _derivePathLE(index: bigint, depth = this.depth): number[] {
    return this._derivePathBE(index, depth).reverse();
  }

  /** Sometimes we want it in BE order, to make truncating easier
   * @param index - The index to derive a path to within the tree, does not have to terminate at a leaf
   * @param depth - The depth to traverse, if not provided it will traverse to the bottom of the tree
   * @returns The path to the leaf in LE order
   */
  private _derivePathBE(index: bigint, depth = this.depth): number[] {
    return index
      .toString(2)
      .padStart(depth, '0')
      .split('')
      .map(x => parseInt(x));
  }

  /**
   * This is a recursive function that upserts a leaf into the tree given a path
   * @param value - The value of the leaf to be upserted
   * @param insertPath - The path to the leaf, this should be ordered from leaf to root (i.e. LE encoded)
   * @param depth - The depth of the tree
   * @param tree - The current tree
   * @param appendMode - If true we append the relevant zeroHashes to the tree as we traverse
   */
  private async _insertLeaf(value: Fr, insertPath: number[], depth: number, tree: Tree): Promise<Tree> {
    if (insertPath.length > this.depth || depth > this.depth) {
      throw new Error('PATH EXCEEDS DEPTH');
    }
    if (depth === 0 || insertPath.length === 0) {
      return Leaf(value);
    }
    switch (tree.tag) {
      case TreeType.NODE: {
        return insertPath.pop() === 0
          ? Node(await this._insertLeaf(value, insertPath, depth - 1, tree.leftTree), tree.rightTree)
          : Node(tree.leftTree, await this._insertLeaf(value, insertPath, depth - 1, tree.rightTree));
      }
      case TreeType.LEAF: {
        const zeroLeaf = Leaf((await this.zeroHashes)[depth - 1]);
        return insertPath.pop() === 0
          ? Node(await this._insertLeaf(value, insertPath, depth - 1, zeroLeaf), zeroLeaf)
          : Node(zeroLeaf, await this._insertLeaf(value, insertPath, depth - 1, zeroLeaf));
      }
    }
  }

  /* Recursive helper for getSiblingPath, this only looks inside the tree and does not resolve using
   * a DB. If a path is not found, it returns an error status that is expected to be handled by the caller
   * @param searchPath - The path to the leaf for which we would like the sibling pathin LE order
   * @param tree - The current tree
   * @param acc - The accumulated sibling path
   */
  private async _getSiblingPath(searchPath: number[], tree: Tree, acc: Fr[]): Promise<AccumulatedSiblingPath> {
    // If we have reached the end of the path, we should be at a leaf or empty node
    // If it is a leaf, we check if the value is equal to the leaf value
    // If it is empty we check if the value is equal to zero
    if (searchPath.length === 0) {
      switch (tree.tag) {
        case TreeType.LEAF:
          return { path: acc, status: SiblingStatus.MEMBER };
        case TreeType.NODE:
          return { path: [], status: SiblingStatus.ERROR };
      }
    }
    // Keep exploring here
    switch (tree.tag) {
      case TreeType.NODE: {
        // Look at the next element of the path to decided if we go left or right, note this mutates!
        return searchPath.pop() === 0
          ? this._getSiblingPath(
              searchPath,
              tree.leftTree,
              [await this.hashTree(tree.rightTree, searchPath.length)].concat(acc),
            )
          : this._getSiblingPath(
              searchPath,
              tree.rightTree,
              [await this.hashTree(tree.leftTree, searchPath.length)].concat(acc),
            );
      }
      // In these two situations we are exploring a subtree we dont have information about
      // We should return an error and look inside the DB
      case TreeType.LEAF:
        return { path: [], status: SiblingStatus.ERROR };
    }
  }
}
