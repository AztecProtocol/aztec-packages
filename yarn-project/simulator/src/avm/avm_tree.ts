import { IndexedTreeId, MerkleTreeId, MerkleTreeReadOperations } from '@aztec/circuit-types';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { IndexedTreeLeafPreimage, TreeLeafPreimage } from '@aztec/foundation/trees';

import cloneDeep from 'lodash.clonedeep';

/****************************************************/
/****** Structs Used by the EphemeralTreeContainer **/
/****************************************************/

/**
 * The preimage and the leaf index of the Low Leaf (Low Nullifier or Low Public Data Leaf)
 */
export type LowPreimageWitness<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  index: bigint;
};

/**
 * Contains the low sibling path and a boolean if the next index pointed to
 * by the low leaf is an update or an insertion (i.e. exists or not).
 */
export type LowWitness<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  index: bigint;
  update: boolean;
  lowSiblingPath: Fr[];
};

/**
 * The result of an indexed insertion in an indexed merkle tree.
 * This will be used to hint the circuit
 */
export type IndexedInsertionResult<T extends IndexedTreeLeafPreimage> = {
  leafIndex: bigint;
  insertionPath: Fr[];
  newOrElementToUpdate: { update: boolean; element: T };
  lowWitness: LowWitness<T>;
};

/****************************************************/
/****** EphemeralTreeContainer Class               **/
/****************************************************/

/**
 * This provides a forkable abstraction over the EphemeralAvmTree class
 *  It contains the logic to look up into a read-only MerkleTreeDb to discover
 *  the sibling paths and low witnesses that weren't inserted as part of this tx
 */
export class EphemeralTreeContainer {
  constructor(
    public treeDb: MerkleTreeReadOperations,
    public treeMap: Map<MerkleTreeId, EphemeralAvmTree>,
    // This contains the preimage (as a buffer) and the leaf index of leaf in the ephemeral tree that contains the lowest "value" (i.e. nullifier value or public data tree slot)
    public indexedTreeMin: Map<IndexedTreeId, [Buffer, bigint]>,
    // This contains the indexed leaf preimages that were updated or inserted in the ephemeral tree and is keyed by leaf index
    // This is needed since we have a sparse collectio of "value" sorted leaves in the ephemeral tree
    public indexedUpdates: Map<IndexedTreeId, Map<bigint, Buffer>>,
  ) {}

  static async create(treeDb: MerkleTreeReadOperations): Promise<EphemeralTreeContainer> {
    const treeMap = new Map<MerkleTreeId, EphemeralAvmTree>();
    const treeTypes = [MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.PUBLIC_DATA_TREE];
    for (const treeType of treeTypes) {
      const treeInfo = await treeDb.getTreeInfo(treeType);
      const tree = await EphemeralAvmTree.create(treeInfo.size, treeInfo.depth, treeDb, treeType);
      treeMap.set(treeType, tree);
    }
    return new EphemeralTreeContainer(treeDb, treeMap, new Map(), new Map());
  }

  fork(): EphemeralTreeContainer {
    return new EphemeralTreeContainer(
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
        try {
          const node = tree.getNode(siblingIndex, tree.depth - i);
          const nodeHash = tree.hashTree(node, i + 1);
          if (!nodeHash.equals(path[i])) {
            path[i] = nodeHash;
          }
        } catch (e) {
          // Nothing happens here, we just didnt find the node in our tree
          // So we dont change the value at this path index
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
   * @param newLeaf - The preimage of the new leaf to be inserted.
   * @returns The sibling path of the new leaf (i.e. the insertion path)
   */
  async appendIndexedTree<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    lowWitnessIndex: bigint,
    lowWitness: T,
    newLeaf: T,
  ): Promise<Fr[]> {
    const tree = this.treeMap.get(treeId)!;
    const newLeafHash = this.hashPreimage(newLeaf);
    const insertIndex = this.treeMap.get(treeId)!.leafCount;

    const lowWitnessHash = this.hashPreimage(lowWitness);
    // Update the low nullifier hash
    this.setIndexedUpdates(treeId, lowWitnessIndex, lowWitness);

    tree.updateLeaf(lowWitnessHash, lowWitnessIndex);
    let insertionPath = tree.getSiblingPath(insertIndex);
    if (insertionPath === undefined) {
      // See if we can get away with directly appending the value
      tree.appendLeaf(Fr.zero());
      insertionPath = tree.getSiblingPath(insertIndex);
      tree.updateLeaf(newLeafHash, insertIndex);
    } else {
      tree.appendLeaf(newLeafHash);
    }
    if (insertionPath === undefined) {
      throw new Error('Insertion path is undefined');
    }
    this.setIndexedUpdates(treeId, insertIndex, newLeaf);

    return insertionPath;
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
    const lowResult = await this._getIndexedLowWitness(treeId, slot, PublicDataTreeLeafPreimage);
    if (lowResult.update) {
      const existingIndex = lowResult.preimage.getNextIndex();
      const existingPreimage =
        this.getIndexedUpdates(treeId, existingIndex, PublicDataTreeLeafPreimage) ??
        (await this.treeDb.getLeafPreimage(treeId, slot.toBigInt()));
      if (existingPreimage === undefined) {
        throw new Error('No previous value found');
      }
      const existingPublicData = PublicDataTreeLeafPreimage.fromBuffer(existingPreimage.toBuffer());
      const existingPublicDataSiblingPath =
        tree.getSiblingPath(existingIndex) ??
        (await this.treeDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, existingIndex)).toFields();

      existingPublicData.value = newValue;
      return {
        leafIndex: existingIndex,
        insertionPath: existingPublicDataSiblingPath,
        newOrElementToUpdate: { update: true, element: existingPublicData },
        lowWitness: lowResult,
      };
    }
    // We are writing to a new slot
    const insertionIndex = tree.leafCount;
    const lowWitness = lowResult.preimage;

    const updateLowWitness = new PublicDataTreeLeafPreimage(
      lowWitness.slot,
      lowWitness.value,
      new Fr(slot.toBigInt()),
      insertionIndex,
    );

    const newPublicDataNode = new PublicDataTreeLeafPreimage(
      slot,
      newValue,
      new Fr(lowWitness.getNextKey()),
      lowWitness.getNextIndex(),
    );
    const insertionPath = await this.appendIndexedTree(treeId, lowResult.index, updateLowWitness, newPublicDataNode);

    // Since we are appending, we might have a new minimum public data leaf
    this._updateMinInfo(
      MerkleTreeId.PUBLIC_DATA_TREE,
      PublicDataTreeLeafPreimage,
      [newPublicDataNode, updateLowWitness],
      [insertionIndex, lowResult.index],
    );
    return {
      leafIndex: insertionIndex,
      insertionPath: insertionPath,
      newOrElementToUpdate: { update: false, element: newPublicDataNode },
      lowWitness: lowResult,
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
    T: { fromBuffer: (buffer: Buffer) => T },
    preimages: T[],
    indices: bigint[],
  ): void {
    let currentMin = this.getMinInfo(treeId, T);
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
  async appendNullifier(value: Fr): Promise<IndexedInsertionResult<NullifierLeafPreimage>> {
    const treeId = MerkleTreeId.NULLIFIER_TREE;
    const tree = this.treeMap.get(treeId)!;
    const lowResult = await this._getIndexedLowWitness(treeId, value, NullifierLeafPreimage);
    if (lowResult.update) {
      throw new Error('Not allowed to update nullifier');
    }
    // We are writing a new entry
    const insertionIndex = tree.leafCount;
    const lowWitness = lowResult.preimage;

    const updateLowWitness = new NullifierLeafPreimage(lowWitness.nullifier, value, insertionIndex);
    const newNullifierNode = new NullifierLeafPreimage(value, lowWitness.nextNullifier, lowWitness.nextIndex);
    const insertionPath = await this.appendIndexedTree(treeId, lowResult.index, updateLowWitness, newNullifierNode);

    // Since we are appending, we might have a new minimum nullifier leaf
    this._updateMinInfo(
      MerkleTreeId.NULLIFIER_TREE,
      NullifierLeafPreimage,
      [newNullifierNode, updateLowWitness],
      [insertionIndex, lowResult.index],
    );
    return {
      leafIndex: insertionIndex,
      insertionPath: insertionPath,
      newOrElementToUpdate: { update: false, element: newNullifierNode },
      lowWitness: lowResult,
    };
  }

  /**
   * This appends a note hash to the note hash tree
   * @param value - The note hash to be appended
   * @returns The insertion result which contains the insertion path
   */
  async appendNoteHash(value: Fr): Promise<Fr[]> {
    const tree = this.treeMap.get(MerkleTreeId.NOTE_HASH_TREE)!;
    tree.appendLeaf(value);
    // We use leafCount - 1 here because we would have just appended a leaf
    const insertionPath = tree.getSiblingPath(tree.leafCount - 1n);
    return insertionPath!;
  }

  /**
   * This is wrapper around treeId to get the correct minimum leaf preimage
   */
  private getMinInfo<ID extends IndexedTreeId, O>(
    treeId: ID,
    O: { fromBuffer: (buffer: Buffer) => O },
  ): { preimage: O; index: bigint } | undefined {
    const start = this.indexedTreeMin.get(treeId);
    if (start === undefined) return undefined;
    const [buffer, index] = start;
    return { preimage: O.fromBuffer(buffer), index };
  }

  /**
   * This is wrapper around treeId to set the correct minimum leaf preimage
   */
  private setMinInfo<ID extends IndexedTreeId>(treeId: ID, preimage: { toBuffer: () => Buffer }, index: bigint): void {
    this.indexedTreeMin.set(treeId, [preimage.toBuffer(), index]);
  }

  /**
   * This is wrapper around treeId to set values in the indexedUpdates map
   */
  private setIndexedUpdates<ID extends IndexedTreeId>(treeId: ID, index: bigint, O: { toBuffer: () => Buffer }): void {
    let updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      updates = new Map();
      this.indexedUpdates.set(treeId, updates);
    }
    updates.set(index, O.toBuffer());
  }

  /**
   * This is wrapper around treeId to get values in the indexedUpdates map
   */
  private getIndexedUpdates<ID extends IndexedTreeId, O>(
    treeId: ID,
    index: bigint,
    O: { fromBuffer: (buffer: Buffer) => O },
  ): O {
    const updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      throw new Error('No updates found');
    }
    const buffer = updates.get(index);
    if (buffer === undefined) {
      throw new Error('No updates found');
    }
    return O.fromBuffer(buffer);
  }

  /**
   * This is wrapper around treeId to check membership (i.e. has()) of index in the indexedUpdates map
   */
  private hasLocalUpdates<ID extends IndexedTreeId>(treeId: ID, index: bigint): boolean {
    const updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) return false;
    return updates.has(index);
  }

  /**
   * This gets the low leaf preimage and the index of the low leaf in the indexed tree given a value (slot or nullifier value)
   * If the value is not found in the tree, it does an external lookup to the merkleDB
   * @param treeId - The tree we are looking up in
   * @param value - The value for which we are look up the low leaf for.
   * @param T - The type of the preimage (PublicData or Nullifier)
   * @returns The low leaf preimage and the index of the low leaf in the indexed tree
   */
  async getLowInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    value: Fr,
    T: { fromBuffer: (buffer: Buffer) => T },
  ): Promise<LowPreimageWitness<T>> {
    // This can probably be done better, we want to say if the minInfo is undefined (because this is our first operation) we do the external lookup
    const minPreimage = this.getMinInfo(treeId, T);
    const start = minPreimage?.preimage;
    // If the first element we have is already greater than the value, we need to do an external lookup
    if (minPreimage === undefined || (start?.getKey() ?? 0n) >= value.toBigInt()) {
      // The low public data witness is in the previous tree
      const { index: lowPublicDataIndex } = (await this.treeDb.getPreviousValueIndex(treeId, value.toBigInt()))!;
      const preimage = await this.treeDb.getLeafPreimage(treeId, lowPublicDataIndex);

      if (preimage === undefined) {
        throw new Error('No previous value found');
      }

      // Since we have never seen this before - we should insert it into our tree
      const lowSiblingPath = (await this.treeDb.getSiblingPath(treeId, lowPublicDataIndex)).toFields();

      // Is it enough to just insert the sibling path without inserting the leaf? - right now probably since we will update this low nullifier index in append
      this.treeMap.get(treeId)!.insertSiblingPath(lowPublicDataIndex, lowSiblingPath);

      const lowPublicDataPreimage = T.fromBuffer(preimage.toBuffer());
      return { preimage: lowPublicDataPreimage, index: lowPublicDataIndex };
    }

    // We look for the low element by bouncing between our local indexedUpdates map or the external DB
    // The conditions we are looking for are (not value here refes to either slot or nullifier depending on the tree type)
    // One more thing to add to the confusion - the preimages use the term key where value is used
    // (1) Exact Match: curr.next_value == value (this is only valid for public data and triggers and update handled by the append function)
    // (2) Sandwich Match: curr.next_value > value and curr.value < value
    // (3) Max Condition: curr.next_index == 0 and curr.value < value
    // Note the min condition does not need to be handled since indexed trees are prefilled with at least the 0 element
    let found = false;
    let curr = minPreimage.preimage;
    let result = undefined;
    const LIMIT = 100_000; // Temp to avoid infinite loops
    let counter = 0;
    let lowPublicDataIndex = minPreimage.index;
    while (!found && counter < LIMIT) {
      // We found it via an exact match
      if (curr.getNextKey() === value.toBigInt()) {
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      } else if (curr.getNextKey() > value.toBigInt() && curr.getKey() < value.toBigInt()) {
        // We found it via sandwich
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      }
      // We found it via the max condition
      else if (curr.getNextIndex() === 0n && curr.getKey() < value.toBigInt()) {
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      }
      // Update the the values for the next iteration
      else {
        lowPublicDataIndex = curr.getNextIndex();
        if (this.hasLocalUpdates(treeId, lowPublicDataIndex)) {
          curr = this.getIndexedUpdates(treeId, lowPublicDataIndex, T)!;
        } else {
          const preimage = (await this.treeDb.getLeafPreimage(treeId, lowPublicDataIndex))!;
          curr = T.fromBuffer(preimage.toBuffer());
        }
      }
      counter++;
    }
    // We did not find it - this is unexpected
    if (result === undefined) throw new Error('No previous value found or ran out of iterations');
    return result;
  }

  /**
   * This hashes the preimage to a field element
   */
  hashPreimage<T extends TreeLeafPreimage>(preimage: T): Fr {
    const input = preimage.toHashInputs().map(x => Fr.fromBuffer(x));
    return poseidon2Hash(input);
  }

  /**
   * This builds on the getLowInfo function to get the sibling path and also checks if this is an update or append operation
   * @param treeId - The tree we are looking up
   * @param value - The value for which we are look up the low leaf for, either a slot or a nullifier
   * @param T - The type of the preimage (PublicData or Nullifier)
   * @returns The low witness which contains the low sibling path, the low leaf preimage and the index of the low leaf in the indexed tree
   */
  private async _getIndexedLowWitness<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    value: Fr,
    T: { fromBuffer: (buffer: Buffer) => T },
  ): Promise<LowWitness<T>> {
    // Get low public data witness
    const { preimage: lowWitness, index } = await this.getLowInfo(treeId, value, T);
    // We check if the slot is already in the tree
    const isUpdate: boolean = lowWitness.getNextKey() === value.toBigInt();
    if (isUpdate) {
      const lowSiblingPath =
        this.treeMap.get(treeId)!.getSiblingPath(index) ?? (await this.treeDb.getSiblingPath(treeId, index)).toFields();
      const result = {
        update: true,
        lowSiblingPath: lowSiblingPath,
        preimage: lowWitness,
        index,
      };
      return result;
    }
    // This is an insertion of a new entry
    const lowSiblingPath =
      this.treeMap.get(treeId)!.getSiblingPath(index) ?? (await this.treeDb.getSiblingPath(treeId, index)).toFields();
    const oldLowWitness = T.fromBuffer(lowWitness.toBuffer());

    // Build Result struct
    const result = {
      update: false,
      lowSiblingPath: lowSiblingPath,
      preimage: oldLowWitness,
      index,
    };

    return result;
  }
}

/****************************************************/
/****** Some useful Structs and Enums **************/
/****************************************************/
enum TreeType {
  LEAF,
  BRANCH,
  EMPTY,
}

type Leaf = {
  tag: TreeType.LEAF;
  value: Fr;
};
type Branch = {
  tag: TreeType.BRANCH;
  leftTree: Tree;
  rightTree: Tree;
};
type Empty = {
  tag: TreeType.EMPTY;
};

type Tree = Leaf | Branch | Empty;

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
const Branch = (left: Tree, right: Tree): Branch => ({
  tag: TreeType.BRANCH,
  leftTree: left,
  rightTree: right,
});

const Leaf = (value: Fr): Leaf => ({
  tag: TreeType.LEAF,
  value,
});

const Empty = (): Empty => ({
  tag: TreeType.EMPTY,
});

/****************************************************/
/****** The EphemeralAvmTree Class *****************/
/****************************************************/

/**
 * This is a recursively defined tree that has leaves at different heights
 * It is seeded by an existing merkle treeDb for which it derives a frontier
 * It is intended to be a lightweight tree that contains only the necessary information to suppport appends or updates
 */
export class EphemeralAvmTree {
  public tree: Tree;
  public zeroHashes: Fr[];
  public leafCount;
  public frontier: Fr[] = [];

  private constructor(public forkedLeafCount: bigint, public depth: number) {
    let zeroHash = Fr.zero();
    // Can probably cache this elsewhere
    const zeroHashes = [];
    zeroHashes.push(zeroHash);
    for (let i = 1; i < this.depth; i++) {
      zeroHash = poseidon2Hash([zeroHash, zeroHash]);
      zeroHashes.push(zeroHash);
    }
    this.tree = Empty();
    this.leafCount = forkedLeafCount;
    this.zeroHashes = zeroHashes;
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
    this.tree = this._insertLeaf(value, insertPath, this.depth, this.tree, true);
    this.leafCount += 1n;
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
    if (status === SiblingStatus.ERROR) return undefined;
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
   * This is a helper function that computes the frontier leaf slots of a tree from the leaf count
   * @param leafCount - The number of leaves in the tree
   */
  // Do we really need LeafCount to be a bigint - log2 is on numbers only
  static computeFrontierLeafSlots(leafCount: number) {
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
    const frontierIndices = EphemeralAvmTree.computeFrontierLeafSlots(Number(this.leafCount));
    // The frontier indices are level-based - i.e. index N at level L.
    // Since we can only ask the DB for paths from the root to the leaf, we do the following complicated calculations
    // 1) The goal is to insert the frontier node N at level L into the tree.
    // 2) We get the path to a leaf that passes through the frontier node we want (there are multiple paths so we just pick one)
    // 3) We can only get sibling paths from the root to the leaf, so we get the sibling path of the leaf from (2)
    // NOTE: This is terribly inefficient and we should probably change the DB API to allow for getting paths to a node

    // These are leaf indexes that pass through the frontier nodes
    const siblingValue = [];
    for (let i = 0; i < frontierIndices.length; i++) {
      // The path we need has the frontier node as a sibling
      const index = BigInt(frontierIndices[i] ^ 1) << BigInt(i);
      const path = await treeDb.getSiblingPath(merkleId, index);

      const frontierPath = this._derivePathLE(BigInt(frontierIndices[i]), this.depth - i);
      siblingValue.push(path.toFields()[i]);
      this.tree = this._insertLeaf(siblingValue[i], frontierPath, this.depth - i, this.tree, true);
    }

    this.frontier = siblingValue;
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
      case TreeType.BRANCH: {
        return poseidon2Hash([this.hashTree(tree.leftTree, depth - 1), this.hashTree(tree.rightTree, depth - 1)]);
      }
      case TreeType.LEAF: {
        return tree.value;
      }
      case TreeType.EMPTY: {
        return this.zeroHashes[depth - 1];
      }
    }
  }

  /**
   * Extracts the subtree from a given index and depth
   * @param index - The index of the node to be extracted
   * @param depth - The depth of the node to be extracted
   * @returns The subtree rooted at the index and depth
   */
  public getNode(index: bigint, depth: number): Tree {
    const path = this._derivePathBE(index, depth);
    const truncatedPath = path.slice(0, depth);
    truncatedPath.reverse();
    return this._getNode(truncatedPath, this.tree);
  }

  /**
   * This is the recursive helper for getNode
   */
  private _getNode(nodePath: number[], tree: Tree): Tree {
    if (nodePath.length === 0) {
      return tree;
    }
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return nodePath.pop() === 0 ? this._getNode(nodePath, tree.leftTree) : this._getNode(nodePath, tree.rightTree);
      }
      case TreeType.LEAF:
      case TreeType.EMPTY: {
        throw new Error('Node not found');
      }
    }
  }

  private _derivePathLE(index: bigint, depth = this.depth): number[] {
    return this._derivePathBE(index, depth).reverse();
  }

  private _derivePathBE(index: bigint, depth = this.depth): number[] {
    return index
      .toString(2)
      .padStart(depth, '0')
      .split('')
      .map(x => parseInt(x));
  }

  /**
   * This is a recursive function that inserts a leaf into the tree given a path
   * @param value - The value of the leaf to be inserted
   * @param insertPath - The path to the leaf, this should be ordered from leaf to root (i.e. LE encoded)
   * @param depth - The depth of the tree
   * @param tree - The current tree
   * @param appendMode - If true we append the relevant zeroHashes to the tree as we traverse
   */
  private _insertLeaf(value: Fr, insertPath: number[], depth: number, tree: Tree, appendMode = false): Tree {
    if (insertPath.length > this.depth || depth > this.depth) {
      throw new Error('PATH EXCEEDS DEPTH');
    }
    if (depth === 0 || insertPath.length === 0) {
      return Leaf(value);
    }
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return insertPath.pop() === 0
          ? Branch(this._insertLeaf(value, insertPath, depth - 1, tree.leftTree, appendMode), tree.rightTree)
          : Branch(tree.leftTree, this._insertLeaf(value, insertPath, depth - 1, tree.rightTree, appendMode));
      }
      case TreeType.LEAF:
      case TreeType.EMPTY: {
        const zeroLeaf = appendMode ? Leaf(this.zeroHashes[depth - 1]) : Empty();
        return insertPath.pop() === 0
          ? Branch(this._insertLeaf(value, insertPath, depth - 1, zeroLeaf, appendMode), zeroLeaf)
          : Branch(zeroLeaf, this._insertLeaf(value, insertPath, depth - 1, zeroLeaf, appendMode));
      }
    }
  }

  // Recursive helper for getSiblingPath
  private _getSiblingPath(searchPath: number[], tree: Tree, acc: Fr[]): AccumulatedSiblingPath {
    // If we have reached the end of the path, we should be at a leaf or empty node
    // If it is a leaf, we check if the value is equal to the leaf value
    // If it is empty we check if the value is equal to zero
    if (searchPath.length === 0) {
      switch (tree.tag) {
        case TreeType.EMPTY:
        case TreeType.LEAF:
          return { path: acc, status: SiblingStatus.MEMBER };
        case TreeType.BRANCH:
          console.log('unexpected end of path');
          return { path: [], status: SiblingStatus.ERROR };
      }
    }
    // Keep exploring here
    switch (tree.tag) {
      case TreeType.BRANCH: {
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
      case TreeType.EMPTY: {
        return { path: [], status: SiblingStatus.ERROR };
      }
    }
  }
}
