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
    // This contains the preimage and the leaf index of leaf in the ephemeral tree that contains the lowest key (i.e. nullifier value or public data tree slot)
    public indexedTreeMin: Map<IndexedTreeId, [IndexedTreeLeafPreimage, bigint]>,
    // This contains the [leaf index,indexed leaf preimages] tuple that were updated or inserted in the ephemeral tree
    // This is needed since we have a sparse collection of keys sorted leaves in the ephemeral tree
    public indexedUpdates: Map<IndexedTreeId, Map<bigint, IndexedTreeLeafPreimage>>,
  ) {}

  static async create(treeDb: MerkleTreeReadOperations): Promise<AvmEphemeralForest> {
    const treeMap = new Map<MerkleTreeId, EphemeralAvmTree>();
    for (const treeType of [MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.PUBLIC_DATA_TREE]) {
      const treeInfo = await treeDb.getTreeInfo(treeType);
      const tree = await EphemeralAvmTree.create(treeInfo.size, treeInfo.depth, treeDb, treeType);
      treeMap.set(treeType, tree);
    }
    return new AvmEphemeralForest(treeDb, treeMap, new Map(), new Map());
  }

  fork(): AvmEphemeralForest {
    return new AvmEphemeralForest(
      this.treeDb,
      cloneDeep(this.treeMap),
      cloneDeep(this.indexedTreeMin),
      cloneDeep(this.indexedUpdates),
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
    let path = tree.getSiblingPath(index);
    if (path === undefined) {
      // We dont have the sibling path in our tree - we have to get it from the DB
      path = (await this.treeDb.getSiblingPath(treeId, index)).toFields();
      // Since the sibling path could be outdated, we compare it with nodes in our tree
      // if we encounter a mismatch, we replace it with the node we found in our tree.
      for (let i = 0; i < path.length; i++) {
        const siblingIndex = index ^ 1n;
        const node = tree.getNode(siblingIndex, tree.depth - i);
        if (node !== undefined) {
          const nodeHash = tree.hashTree(node, i + 1);
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
  appendIndexedTree<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    lowLeafIndex: bigint,
    lowLeafPreimage: T,
    newLeafPreimage: T,
  ): Fr[] {
    const tree = this.treeMap.get(treeId)!;
    const newLeaf = this.hashPreimage(newLeafPreimage);
    const insertIndex = tree.leafCount;

    const lowLeaf = this.hashPreimage(lowLeafPreimage);
    // Update the low nullifier hash
    this.setIndexedUpdates(treeId, lowLeafIndex, lowLeafPreimage);
    tree.updateLeaf(lowLeaf, lowLeafIndex);
    // Append the new leaf
    tree.appendLeaf(newLeaf);
    this.setIndexedUpdates(treeId, insertIndex, newLeafPreimage);

    return tree.getSiblingPath(insertIndex)!;
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
      tree.updateLeaf(this.hashPreimage(updatedPreimage), index);
      tree.appendLeaf(Fr.ZERO);
      this.setIndexedUpdates(treeId, index, updatedPreimage);
      this.setIndexedUpdates(treeId, insertionIndex, emptyLeaf);
      const insertionPath = tree.getSiblingPath(insertionIndex)!;

      // Even though we append an empty leaf into the tree as a part of update - it doesnt seem to impact future inserts...
      this._updateMinInfo(MerkleTreeId.PUBLIC_DATA_TREE, [updatedPreimage], [index]);
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
    const insertionPath = this.appendIndexedTree(treeId, index, updatedLowLeaf, newPublicDataLeaf);

    // Since we are appending, we might have a new minimum public data leaf
    this._updateMinInfo(MerkleTreeId.PUBLIC_DATA_TREE, [newPublicDataLeaf, updatedLowLeaf], [insertionIndex, index]);
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

  /**
   * This is just a helper to compare the preimages and update the minimum public data leaf
   * @param treeId - The tree to be queried for a sibling path.
   * @param T - The type of the preimage (PublicData or Nullifier)
   * @param preimages - The preimages to be compared
   * @param indices - The indices of the preimages
   */
  private _updateMinInfo<T extends IndexedTreeLeafPreimage>(
    treeId: IndexedTreeId,
    preimages: T[],
    indices: bigint[],
  ): void {
    let currentMin = this.getMinInfo(treeId);
    if (currentMin === undefined) {
      currentMin = { preimage: preimages[0], index: indices[0] };
    }
    for (let i = 0; i < preimages.length; i++) {
      if (preimages[i].getKey() <= currentMin.preimage.getKey()) {
        currentMin = { preimage: preimages[i], index: indices[i] };
      }
    }
    this.setMinInfo(treeId, currentMin.preimage, currentMin.index);
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
    const insertionPath = this.appendIndexedTree(treeId, index, updatedLowNullifier, newNullifierLeaf);

    // Since we are appending, we might have a new minimum nullifier leaf
    this._updateMinInfo(MerkleTreeId.NULLIFIER_TREE, [newNullifierLeaf, updatedLowNullifier], [insertionIndex, index]);
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
  appendNoteHash(noteHash: Fr): Fr[] {
    const tree = this.treeMap.get(MerkleTreeId.NOTE_HASH_TREE)!;
    tree.appendLeaf(noteHash);
    // We use leafCount - 1 here because we would have just appended a leaf
    const insertionPath = tree.getSiblingPath(tree.leafCount - 1n);
    return insertionPath!;
  }

  /**
   * This is wrapper around treeId to get the correct minimum leaf preimage
   */
  private getMinInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
  ): { preimage: T; index: bigint } | undefined {
    const start = this.indexedTreeMin.get(treeId);
    if (start === undefined) {
      return undefined;
    }
    const [preimage, index] = start;
    return { preimage: preimage as T, index };
  }

  /**
   * This is wrapper around treeId to set the correct minimum leaf preimage
   */
  private setMinInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    preimage: T,
    index: bigint,
  ): void {
    this.indexedTreeMin.set(treeId, [preimage, index]);
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
    // This can probably be done better, we want to say if the minInfo is undefined (because this is our first operation) we do the external lookup
    const minPreimage = this.getMinInfo(treeId);
    const start = minPreimage?.preimage;
    const bigIntKey = key.toBigInt();
    // If the first element we have is already greater than the value, we need to do an external lookup
    if (minPreimage === undefined || (start?.getKey() ?? 0n) >= key.toBigInt()) {
      // The low public data witness is in the previous tree
      const { index, alreadyPresent } = (await this.treeDb.getPreviousValueIndex(treeId, bigIntKey))!;
      const preimage = await this.treeDb.getLeafPreimage(treeId, index);

      // Since we have never seen this before - we should insert it into our tree
      const siblingPath = (await this.treeDb.getSiblingPath(treeId, index)).toFields();

      // Is it enough to just insert the sibling path without inserting the leaf? - right now probably since we will update this low nullifier index in append
      this.treeMap.get(treeId)!.insertSiblingPath(index, siblingPath);

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
    let curr = minPreimage.preimage as T;
    let result: PreimageWitness<T> | undefined = undefined;
    // Temp to avoid infinite loops - the limit is the number of leaves we may have to read
    const LIMIT = 2n ** BigInt(getTreeHeight(treeId)) - 1n;
    let counter = 0n;
    let lowPublicDataIndex = minPreimage.index;
    while (!found && counter < LIMIT) {
      if (curr.getKey() === bigIntKey) {
        // We found an exact match - therefore this is an update
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex, update: true };
      } else if (curr.getKey() < bigIntKey && (curr.getNextKey() === 0n || curr.getNextKey() > bigIntKey)) {
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
  hashPreimage<T extends TreeLeafPreimage>(preimage: T): Fr {
    // Watch for this edge-case, we are hashing the key=0 leaf to 0.
    // This is for backward compatibility with the world state implementation
    if (preimage.getKey() === 0n) {
      return Fr.zero();
    }
    const input = preimage.toHashInputs().map(x => Fr.fromBuffer(x));
    return poseidon2Hash(input);
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
  private tree: Tree;
  private readonly zeroHashes: Fr[];
  public frontier: Fr[];

  private constructor(public leafCount: bigint, public depth: number) {
    let zeroHash = Fr.zero();
    // Can probably cache this elsewhere
    const zeroHashes = [];
    for (let i = 0; i < this.depth; i++) {
      zeroHashes.push(zeroHash);
      zeroHash = poseidon2Hash([zeroHash, zeroHash]);
    }
    this.tree = Leaf(zeroHash);
    this.zeroHashes = zeroHashes;
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
  appendLeaf(value: Fr): void {
    const insertPath = this._derivePathLE(this.leafCount);
    this.tree = this._insertLeaf(value, insertPath, this.depth, this.tree);
    this.leafCount++;
  }

  /**
   * This is a recursive function that upserts a leaf into the tree at a index and depth
   * @param value - The value of the leaf to be inserted
   * @param index - The index of the leaf to be inserted
   * @param depth - The depth of the leaf to be inserted (defaults to the bottom of the tree)
   */
  updateLeaf(value: Fr, index: bigint, depth = this.depth): void {
    const insertPath = this._derivePathLE(index, depth);
    this.tree = this._insertLeaf(value, insertPath, depth, this.tree);
  }

  /**
   * Get the sibling path of a leaf in the tree
   * @param index - The index of the leaf for which a sibling path should be returned.
   * @returns The sibling path of the leaf, can fail if the path is not found
   */
  getSiblingPath(index: bigint): Fr[] | undefined {
    const searchPath = this._derivePathLE(index);
    // Handle cases where we error out
    const { path, status } = this._getSiblingPath(searchPath, this.tree, []);
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
  insertSiblingPath(index: bigint, siblingPath: Fr[]): void {
    for (let i = 0; i < siblingPath.length; i++) {
      // Flip(XOR) the last bit because we are inserting siblings of the leaf
      const sibIndex = index ^ 1n;
      this.updateLeaf(siblingPath[i], sibIndex, this.depth - i);
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
      this.tree = this._insertLeaf(frontierValue, frontierPath, this.depth - i, this.tree);
    }
    this.frontier = frontierValues;
  }

  /**
   * Computes the root of the tree
   */
  public getRoot(): Fr {
    return this.hashTree(this.tree, this.depth);
  }

  /**
   * Recursively hashes the subtree
   * @param tree - The tree to be hashed
   * @param depth - The depth of the tree
   */
  public hashTree(tree: Tree, depth: number): Fr {
    switch (tree.tag) {
      case TreeType.NODE: {
        return poseidon2Hash([this.hashTree(tree.leftTree, depth - 1), this.hashTree(tree.rightTree, depth - 1)]);
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
  public getNode(index: bigint, depth: number): Tree | undefined {
    const path = this._derivePathBE(index, depth);
    const truncatedPath = path.slice(0, depth);
    truncatedPath.reverse();
    try {
      return this._getNode(truncatedPath, this.tree);
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
  private _insertLeaf(value: Fr, insertPath: number[], depth: number, tree: Tree): Tree {
    if (insertPath.length > this.depth || depth > this.depth) {
      throw new Error('PATH EXCEEDS DEPTH');
    }
    if (depth === 0 || insertPath.length === 0) {
      return Leaf(value);
    }
    switch (tree.tag) {
      case TreeType.NODE: {
        return insertPath.pop() === 0
          ? Node(this._insertLeaf(value, insertPath, depth - 1, tree.leftTree), tree.rightTree)
          : Node(tree.leftTree, this._insertLeaf(value, insertPath, depth - 1, tree.rightTree));
      }
      case TreeType.LEAF: {
        const zeroLeaf = Leaf(this.zeroHashes[depth - 1]);
        return insertPath.pop() === 0
          ? Node(this._insertLeaf(value, insertPath, depth - 1, zeroLeaf), zeroLeaf)
          : Node(zeroLeaf, this._insertLeaf(value, insertPath, depth - 1, zeroLeaf));
      }
    }
  }

  /* Recursive helper for getSiblingPath, this only looks inside the tree and does not resolve using
   * a DB. If a path is not found, it returns an error status that is expected to be handled by the caller
   * @param searchPath - The path to the leaf for which we would like the sibling pathin LE order
   * @param tree - The current tree
   * @param acc - The accumulated sibling path
   */
  private _getSiblingPath(searchPath: number[], tree: Tree, acc: Fr[]): AccumulatedSiblingPath {
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
              [this.hashTree(tree.rightTree, searchPath.length)].concat(acc),
            )
          : this._getSiblingPath(
              searchPath,
              tree.rightTree,
              [this.hashTree(tree.leftTree, searchPath.length)].concat(acc),
            );
      }
      // In these two situations we are exploring a subtree we dont have information about
      // We should return an error and look inside the DB
      case TreeType.LEAF:
        return { path: [], status: SiblingStatus.ERROR };
    }
  }
}
