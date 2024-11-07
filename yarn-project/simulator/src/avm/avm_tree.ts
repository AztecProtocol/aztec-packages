import { IndexedTreeId, MerkleTreeId, MerkleTreeReadOperations } from '@aztec/circuit-types';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { IndexedTreeLeafPreimage, TreeLeafPreimage } from '@aztec/foundation/trees';

import cloneDeep from 'lodash.clonedeep';

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
/****** Some Helpful Constructors      **************/
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
/****** Helpful Container Things      **************/
/****************************************************/

export type LowNullifierWitness = {
  preimage: NullifierLeafPreimage;
  index: bigint;
};

export type LowPublicDataWitness = {
  preimage: PublicDataTreeLeafPreimage;
  index: bigint;
};

export type LowPreimageWitness<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  index: bigint;
};

export type LowWitness<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  index: bigint;
  update: boolean;
  lowSiblingPath: Fr[];
};

export type IndexedInsertionResult<T extends IndexedTreeLeafPreimage> = {
  leafIndex: bigint;
  insertionPath: Fr[];
  newOrElementToUpdate: { update: boolean; element: T };
  lowWitness: LowWitness<T>;
};

export const computeNullifierHash = (nullifier: NullifierLeafPreimage): Fr => {
  return poseidon2Hash([nullifier.nullifier, nullifier.nextNullifier, nullifier.nextIndex]);
};

export const computePublicDataHash = (publicData: PublicDataTreeLeafPreimage): Fr => {
  const v = publicData.toHashInputs().map(x => Fr.fromBuffer(x));
  return poseidon2Hash(v);
};

export class EphemeralTreeContainer {
  // public indexedTreeMin: Map<IndexedTreeId, [Buffer, bigint]> = new Map();
  // public indexedUpdates: Map<IndexedTreeId, Map<bigint, Buffer>> = new Map();

  constructor(
    public treeDb: MerkleTreeReadOperations,
    public treeMap: Map<MerkleTreeId, EphemeralAvmTree>,
    public indexedTreeMin: Map<IndexedTreeId, [Buffer, bigint]>,
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

  async getSiblingPath(treeId: MerkleTreeId, index: bigint): Promise<Fr[]> {
    const tree = this.treeMap.get(treeId)!;
    let path = tree.getSiblingPath(index);
    if (path === undefined) {
      // We dont have the sibling path in our tree - we have to get it from the DB
      path = (await this.treeDb.getSiblingPath(treeId, index)).toFields();
      // Since the sibling path could be outdated, we compare it with nodes in our tree
      // if we encounter a mismatch, we use the node we found in our tree.
      // Otherwise we use the value from the DB.
      for (let i = 0; i < path.length; i++) {
        const siblingIndex = index ^ 1n;
        try {
          const node = tree.getNode(siblingIndex, tree.depth - i);
          const nodeHash = tree._hashTree(node, i + 1);
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

  async appendIndexedTree<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    lowWitnessIndex: bigint,
    lowWitness: T,
    newLeaf: T,
  ): Promise<Fr[]> {
    const tree = this.treeMap.get(treeId);
    if (tree === undefined) {
      throw new Error('Tree not found');
    }
    const newLeafHash = this.hashPreimage(newLeaf);
    const insertIndex = this.treeMap.get(treeId)!.leafCount;

    const lowWitnessHash = this.hashPreimage(lowWitness);
    // Update the low nullifier hash
    this.setIndexedUpdates(treeId, lowWitnessIndex, lowWitness);

    tree.updateLeaf(lowWitnessHash, lowWitnessIndex);
    let insertionPath = tree.getSiblingPath(insertIndex);
    if (insertionPath === undefined) {
      // Do we append zero just to get the sibling path?
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

  async writePublicStorage(slot: Fr, newValue: Fr): Promise<IndexedInsertionResult<PublicDataTreeLeafPreimage>> {
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
    // we are Appending here
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

  private _updateMinInfo<T extends IndexedTreeLeafPreimage>(
    treeId: IndexedTreeId,
    T: { fromBuffer: (buffer: Buffer) => T },
    stuff: T[],
    indices: bigint[],
  ): void {
    let currentMin = this.getMinInfo(treeId, T);
    if (currentMin === undefined) {
      currentMin = { preimage: stuff[0], index: indices[0] };
    }
    for (let i = 0; i < stuff.length; i++) {
      if (stuff[i].getKey() <= currentMin.preimage.getKey()) {
        currentMin = { preimage: stuff[i], index: indices[i] };
      }
    }
    this.setMinInfo(treeId, currentMin.preimage, currentMin.index);
  }

  async appendNullifier(value: Fr): Promise<IndexedInsertionResult<NullifierLeafPreimage>> {
    const treeId = MerkleTreeId.NULLIFIER_TREE;
    const tree = this.treeMap.get(treeId)!;
    const lowResult = await this._getIndexedLowWitness(treeId, value, NullifierLeafPreimage);
    if (lowResult.update) {
      throw new Error('Not allowed to update nullifier');
    }
    // we are Appending here
    const insertionIndex = tree.leafCount;
    const lowWitness = lowResult.preimage;

    const updateLowWitness = new NullifierLeafPreimage(lowWitness.nullifier, value, insertionIndex);
    const newNullifierNode = new NullifierLeafPreimage(value, lowWitness.nextNullifier, lowWitness.nextIndex);
    const insertionPath = await this.appendIndexedTree(treeId, lowResult.index, updateLowWitness, newNullifierNode);

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

  async appendLeaf(treeId: MerkleTreeId, value: Fr): Promise<Fr[]> {
    switch (treeId) {
      case MerkleTreeId.NOTE_HASH_TREE:
        return this._handleNoteHashAppend(value);
      default:
        throw new Error(`Tree ID ${treeId} isn't supposed to be appended to`);
    }
  }

  private async _handleNoteHashAppend(value: Fr): Promise<Fr[]> {
    const tree = this.treeMap.get(MerkleTreeId.NOTE_HASH_TREE)!;
    tree.appendLeaf(value);
    const insertionPath =
      tree.getSiblingPath(tree.leafCount - 1n) ??
      (await this.treeDb.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, tree.leafCount - 1n)).toFields();
    return insertionPath;
  }

  private getMinInfo<ID extends IndexedTreeId, O>(
    treeId: ID,
    O: { fromBuffer: (buffer: Buffer) => O },
  ): { preimage: O; index: bigint } | undefined {
    const start = this.indexedTreeMin.get(treeId);
    if (start === undefined) return undefined;
    const [buffer, index] = start;
    return { preimage: O.fromBuffer(buffer), index };
  }

  private setIndexedUpdates<ID extends IndexedTreeId>(treeId: ID, index: bigint, O: { toBuffer: () => Buffer }): void {
    let updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) {
      updates = new Map();
      this.indexedUpdates.set(treeId, updates);
    }
    updates.set(index, O.toBuffer());
  }

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

  private hasLocalUpdates<ID extends IndexedTreeId>(treeId: ID, index: bigint): boolean {
    const updates = this.indexedUpdates.get(treeId);
    if (updates === undefined) return false;
    return updates.has(index);
  }

  private setMinInfo<ID extends IndexedTreeId>(treeId: ID, preimage: { toBuffer: () => Buffer }, index: bigint): void {
    this.indexedTreeMin.set(treeId, [preimage.toBuffer(), index]);
  }

  async getLowInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    value: Fr,
    T: { fromBuffer: (buffer: Buffer) => T },
  ): Promise<LowPreimageWitness<T>> {
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

      // Is it enough to just insert the sibling path without inserting the leaf?
      this.treeMap.get(treeId)!.insertSiblingPath(lowPublicDataIndex, lowSiblingPath);

      const lowPublicDataPreimage = T.fromBuffer(preimage.toBuffer());
      return { preimage: lowPublicDataPreimage, index: lowPublicDataIndex };
    }
    // We look for the element that is just less than the value and whose next element is greater than the value
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

  // Should check old nullifier prior

  hashPreimage<T extends TreeLeafPreimage>(preimage: T): Fr {
    const input = preimage.toHashInputs().map(x => Fr.fromBuffer(x));
    return poseidon2Hash(input);
  }

  private async _getIndexedLowWitness<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    slot: Fr,
    T: { fromBuffer: (buffer: Buffer) => T },
  ): Promise<LowWitness<T>> {
    // Get low public data witness
    const { preimage: lowWitness, index } = await this.getLowInfo(treeId, slot, T);
    // We check if the slot is already in the tree
    const isUpdate: boolean = lowWitness.getNextKey() === slot.toBigInt();
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
    // Does this copy?
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
/****** The EphemeralAvmTree Class *****************/
/****************************************************/
export class EphemeralAvmTree {
  public tree: Tree;
  public zeroHashes: Fr[];
  public leafCount;
  public frontier: Fr[] = [];

  private constructor(public forkedLeafCount: bigint, public depth: number) {
    let zeroHash = Fr.zero();
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

  appendLeaf(value: Fr): void {
    const insertPath = this._derivePathLE(this.leafCount);
    this.tree = this._insertLeaf(value, insertPath, this.depth, this.tree, true);
    this.leafCount += 1n;
  }

  updateLeaf(value: Fr, index: bigint, depth = this.depth): void {
    const insertPath = this._derivePathLE(index, depth);
    this.tree = this._insertLeaf(value, insertPath, depth, this.tree);
  }

  getSiblingPath(index: bigint): Fr[] | undefined {
    const searchPath = this._derivePathLE(index);
    // Handle cases where we error out
    const { path, status } = this._getSiblingPath(searchPath, this.tree, []);
    if (status === SiblingStatus.ERROR) return undefined;
    return path;
  }

  insertSiblingPath(index: bigint, siblingPath: Fr[]): void {
    for (let i = 0; i < siblingPath.length; i++) {
      // Flip(XOR) the last bit because we are inserting siblings of the leaf
      const sibIndex = index ^ 1n;
      this.updateLeaf(siblingPath[i], sibIndex, this.depth - i);
      index >>= 1n;
    }
  }

  // Do we really need LeafCount to be a bigint?
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

  public getRoot(): Fr {
    return this._hashTree(this.tree, this.depth);
  }

  public _hashTree(tree: Tree, depth: number): Fr {
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return poseidon2Hash([this._hashTree(tree.leftTree, depth - 1), this._hashTree(tree.rightTree, depth - 1)]);
      }
      case TreeType.LEAF: {
        return tree.value;
      }
      case TreeType.EMPTY: {
        console.log('Hashing empty subtree at depth: ', depth);
        // throw new Error('Hashing empty subtree');
        return this.zeroHashes[depth - 1];
      }
    }
  }

  public getNode(index: bigint, depth: number): Tree {
    const path = this._derivePathBE(index, depth);
    const truncatedPath = path.slice(0, depth);
    truncatedPath.reverse();
    return this._getNode(truncatedPath, this.tree);
  }

  _getNode(nodePath: number[], tree: Tree): Tree {
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

  // InsertPath should be a list of 0s and 1s, and should be LE-encoding of index
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
              [this._hashTree(tree.rightTree, searchPath.length)].concat(acc),
            )
          : this._getSiblingPath(
              searchPath,
              tree.rightTree,
              [this._hashTree(tree.leftTree, searchPath.length)].concat(acc),
            );
      }
      // In these two situations we are exploring a subtree we dont have information about
      // We should return an error and look inside the DB
      case TreeType.LEAF:
      case TreeType.EMPTY: {
        // Temp Helpful log
        // console.log('Exploring a subtree we dont have information about');
        return { path: [], status: SiblingStatus.ERROR };
      }
    }
  }
}
