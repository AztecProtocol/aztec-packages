import { IndexedTreeId, MerkleTreeId } from '@aztec/circuit-types';
import { MerkleTreeReadOperations } from '@aztec/circuit-types';
import { NullifierLeafPreimage, PUBLIC_DATA_TREE_HEIGHT, PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { IndexedTreeLeaf, IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

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

export type IndexedInsertionResult<T> = {
  leafIndex: bigint;
  insertionPath: Fr[];
  lowSiblingPath: Fr[];
  lowWitness: T;
};

export const computeNullifierHash = (nullifier: NullifierLeafPreimage): Fr => {
  return poseidon2Hash([nullifier.nullifier, nullifier.nextNullifier, nullifier.nextIndex]);
};

export const computePublicDataHash = (publicData: PublicDataTreeLeafPreimage): Fr => {
  const v = publicData.toHashInputs().map(x => Fr.fromBuffer(x));
  return poseidon2Hash(v);
  // return poseidon2Hash([publicData.slot, publicData.value, publicData.nextSlot, publicData.nextIndex]);
  // return poseidon2Hash([publicData.slot, publicData.value, publicData.nextIndex, publicData.nextSlot]);
  // return std::vector<fr>({ slot, value, nextIndex, nextValue });
};

export class EphemeralTreeContainer {
  public indexedTreeMin: Map<IndexedTreeId, [Buffer, bigint]> = new Map();
  public nullifierUpdates: Map<bigint, NullifierLeafPreimage> = new Map(); // This is a sorted map
  public minNullifier: NullifierLeafPreimage | undefined = undefined;
  public minNullifierIndex: bigint | undefined = undefined;
  public publicDataUpdates: Map<bigint, PublicDataTreeLeafPreimage> = new Map();
  public minPublicData: PublicDataTreeLeafPreimage | undefined = undefined;
  public minPublicDataIndex: bigint | undefined = undefined;

  constructor(
    private treeDb: MerkleTreeReadOperations,
    public nullifierTree: EphemeralAvmTree,
    public noteHashTree: EphemeralAvmTree,
    public publicDataTree: EphemeralAvmTree,
  ) {}

  static async create(treeDb: MerkleTreeReadOperations): Promise<EphemeralTreeContainer> {
    const nullifierTreeInfo = await treeDb.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
    const nullifierTree = await EphemeralAvmTree.create(
      nullifierTreeInfo.size,
      nullifierTreeInfo.depth,
      treeDb,
      MerkleTreeId.NULLIFIER_TREE,
    );
    const noteHashInfo = await treeDb.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE);
    const noteHashTree = await EphemeralAvmTree.create(
      noteHashInfo.size,
      noteHashInfo.depth,
      treeDb,
      MerkleTreeId.NOTE_HASH_TREE,
    );
    const publicDataTreeInfo = await treeDb.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE);
    const publicDataTree = await EphemeralAvmTree.create(
      publicDataTreeInfo.size,
      publicDataTreeInfo.depth,
      treeDb,
      MerkleTreeId.PUBLIC_DATA_TREE,
    );
    return new EphemeralTreeContainer(treeDb, nullifierTree, noteHashTree, publicDataTree);
  }

  async writePublicStorage(slot: Fr, value: Fr): Promise<IndexedInsertionResult<LowPublicDataWitness>> {
    return this._handlePublicDataUpdate(slot, value);
  }

  async appendNullifier(value: Fr): Promise<IndexedInsertionResult<NullifierLeafPreimage>> {
    return this._handleNullifierInsertion(value);
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
    this.noteHashTree.appendLeaf(value);
    const insertionPath =
      this.noteHashTree.getSiblingPath(value, this.noteHashTree.leafCount) ??
      (await this.treeDb.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, this.noteHashTree.leafCount - 1n)).toFields();
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

  // Check this also works for min and max values
  async getLowNullifier<ID extends IndexedTreeId>(treeId: ID, value: Fr): Promise<LowNullifierWitness> {
    const start = this.minNullifier;
    // If the first element we have is already greater than the value, we need to do an external lookup
    if ((start?.nullifier ?? 0) >= value || start === undefined) {
      // The low nullifier is in the previous tree
      const { index: lowNullifierIndex } = (await this.treeDb.getPreviousValueIndex(treeId, value.toBigInt()))!;
      const preimage = await this.treeDb.getLeafPreimage(treeId, lowNullifierIndex);

      if (preimage === undefined) {
        throw new Error('No previous value found');
      }

      const lowNullifier = NullifierLeafPreimage.fromBuffer(preimage.toBuffer());
      return { preimage: lowNullifier, index: lowNullifierIndex };
    }
    // We look for the element that is just less than the value and whose next element is greater than the value
    let found = false;
    let curr = start;
    let result = undefined;
    const LIMIT = 100_000; // Temp to avoid infinite loops
    let counter = 0;
    let lowNullifierIndex = this.minNullifierIndex!;
    while (!found && counter < LIMIT) {
      // We found it via an exact match
      if (curr.nextNullifier.equals(value)) {
        found = true;
        result = { preimage: curr, index: lowNullifierIndex };
      } else if (curr.nextNullifier > value && curr.nullifier < value) {
        // We found it via sandwich
        found = true;
        result = { preimage: curr, index: lowNullifierIndex };
      }
      // We found it via the max condition
      else if (curr.nextIndex === 0n && curr.nullifier < value) {
        found = true;
        result = { preimage: curr, index: lowNullifierIndex };
      }
      // Update the the values for the next iteration
      else {
        lowNullifierIndex = curr.nextIndex;
        if (this.nullifierUpdates.has(lowNullifierIndex)) {
          curr = this.nullifierUpdates.get(lowNullifierIndex)!;
        } else {
          const preimage = (await this.treeDb.getLeafPreimage(treeId, lowNullifierIndex))!;
          curr = NullifierLeafPreimage.fromBuffer(preimage.toBuffer());
        }
      }
      counter++;
    }
    // We did not find it - this is unexpected
    if (result === undefined) throw new Error('No previous value found');
    return result;
  }

  //***** THIS LOOKS LIKE HTE SMAE AS THE FIRST - CAN WE CONSOLIDATE
  async getLowPublicData<ID extends IndexedTreeId>(treeId: ID, value: Fr): Promise<LowPublicDataWitness> {
    const start = this.minPublicData;
    // If the first element we have is already greater than the value, we need to do an external lookup
    if ((start?.value ?? 0) >= value || start === undefined) {
      // The low public data witness is in the previous tree
      const { index: lowPublicDataIndex } = (await this.treeDb.getPreviousValueIndex(treeId, value.toBigInt()))!;
      const preimage = await this.treeDb.getLeafPreimage(treeId, lowPublicDataIndex);

      if (preimage === undefined) {
        throw new Error('No previous value found');
      }

      // Since we have never seen this before - we should insert it into our tree
      const lowSiblingPath = (await this.treeDb.getSiblingPath(treeId, lowPublicDataIndex)).toFields();
      this.publicDataTree.insertSiblingPath(lowPublicDataIndex, lowSiblingPath);
      const getAnother = this.publicDataTree.getSiblingPath(value, lowPublicDataIndex);

      const lowPublicDataPreimage = PublicDataTreeLeafPreimage.fromBuffer(preimage.toBuffer());
      return { preimage: lowPublicDataPreimage, index: lowPublicDataIndex };
    }
    // We look for the element that is just less than the value and whose next element is greater than the value
    let found = false;
    let curr = start;
    let result = undefined;
    const LIMIT = 100_000; // Temp to avoid infinite loops
    let counter = 0;
    let lowPublicDataIndex = this.minPublicDataIndex!;
    while (!found && counter < LIMIT) {
      // We found it via an exact match
      if (curr.nextSlot.equals(value)) {
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      } else if (curr.nextSlot > value && curr.slot < value) {
        // We found it via sandwich
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      }
      // We found it via the max condition
      else if (curr.nextIndex === 0n && curr.slot < value) {
        found = true;
        result = { preimage: curr, index: lowPublicDataIndex };
      }
      // Update the the values for the next iteration
      else {
        lowPublicDataIndex = curr.nextIndex;
        if (this.publicDataUpdates.has(lowPublicDataIndex)) {
          curr = this.publicDataUpdates.get(lowPublicDataIndex)!;
        } else {
          const preimage = (await this.treeDb.getLeafPreimage(treeId, lowPublicDataIndex))!;
          curr = PublicDataTreeLeafPreimage.fromBuffer(preimage.toBuffer());
        }
      }
      counter++;
    }
    // We did not find it - this is unexpected
    if (result === undefined) throw new Error('No previous value found');
    return result;
  }

  // Should check old nullifier prior
  private async _handleNullifierInsertion(value: Fr): Promise<IndexedInsertionResult<NullifierLeafPreimage>> {
    // Get low nullifier
    const { preimage: lowNullifier, index } = await this.getLowNullifier(MerkleTreeId.NULLIFIER_TREE, value);

    const lowNullifierPath =
      this.nullifierTree.getSiblingPath(lowNullifier.nullifier, index) ??
      (await this.treeDb.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, index)).toFields();
    // The newly inserted nullifier will inherit the low nullifier's "next" values.
    const newNullifier = new NullifierLeafPreimage(value, lowNullifier.nextNullifier, lowNullifier.nextIndex);
    const newNullifierHash = computeNullifierHash(newNullifier);
    const insertionIndex = this.publicDataTree.leafCount;
    // The low nullifier will have the new nullifier as its next value
    const oldLowNullifier = lowNullifier.clone();
    lowNullifier.nextNullifier = value;
    lowNullifier.nextIndex = this.nullifierTree.leafCount;
    const lowNullifierHash = computeNullifierHash(lowNullifier);
    this.nullifierTree.updateLeaf(lowNullifierHash, index);
    // Update the local map - indexed by insertion order
    this.nullifierUpdates.set(index, lowNullifier);
    this.nullifierUpdates.set(this.nullifierTree.leafCount, newNullifier);
    // Build result struct
    let insertionPath = this.nullifierTree.getSiblingPath(newNullifierHash, insertionIndex);
    if (insertionPath === undefined) {
      // Do we append zero just to get the sibling path?
      this.nullifierTree.appendLeaf(Fr.zero());
      insertionPath = this.nullifierTree.getSiblingPath(newNullifierHash, insertionIndex)!;
      this.nullifierTree.updateLeaf(newNullifierHash, insertionIndex);
    } else {
      this.nullifierTree.appendLeaf(newNullifierHash);
    }
    const result = {
      leafIndex: insertionIndex /** leaf index **/,
      insertionPath: insertionPath,
      lowSiblingPath: lowNullifierPath,
      lowWitness: oldLowNullifier,
    };
    // Update the nullifier tree with the old nullifier and the new nullifier
    this.nullifierTree.appendLeaf(newNullifierHash);

    // Now we update our view of what the minimum nullifier in our set is
    // Should probably clean this up
    if (this.minNullifier === undefined) {
      this.minNullifier = newNullifier;
      this.minNullifierIndex = this.nullifierTree.leafCount;
    }
    // We do <= here because the nullifier value might be the same but the next values change (i.e. Low nullifier updated)
    if (newNullifier.nullifier <= this.minNullifier.nullifier) {
      this.minNullifier = newNullifier;
      this.minNullifierIndex = this.nullifierTree.leafCount;
    }
    if (lowNullifier.nullifier <= this.minNullifier.nullifier) {
      this.minNullifier = lowNullifier;
      this.minNullifierIndex = index;
    }
    return result;
  }

  private async _handlePublicDataUpdate(slot: Fr, newValue: Fr): Promise<IndexedInsertionResult<LowPublicDataWitness>> {
    // Get low public data witness
    const { preimage: lowWitness, index } = await this.getLowPublicData(MerkleTreeId.PUBLIC_DATA_TREE, slot);
    // We check if the slot is already in the tree
    const isUpdate: boolean = lowWitness.nextSlot.equals(slot);
    if (isUpdate) {
      // If we are updating then the low nullifier stays the same
      const existingPreimage =
        this.publicDataUpdates.get(slot.toBigInt()) ??
        (await this.treeDb.getLeafPreimage(MerkleTreeId.PUBLIC_DATA_TREE, slot.toBigInt()));
      if (existingPreimage === undefined) {
        throw new Error('No previous value found');
      }
      const existingPublicData = PublicDataTreeLeafPreimage.fromBuffer(existingPreimage.toBuffer());
      const existingPublicDataSiblingPath =
        this.publicDataTree.getSiblingPath(computePublicDataHash(existingPublicData), lowWitness.nextIndex) ??
        (await this.treeDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowWitness.nextIndex)).toFields();

      const lowSiblingPath =
        this.publicDataTree.getSiblingPath(computePublicDataHash(lowWitness), index) ??
        (await this.treeDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, index)).toFields();
      const result = {
        leafIndex: lowWitness.nextIndex /** leaf index **/,
        insertionPath: existingPublicDataSiblingPath,
        lowSiblingPath: lowSiblingPath,
        lowWitness: {
          preimage: existingPublicData,
          index,
        },
      };

      existingPublicData.value = newValue;
      this.publicDataUpdates.set(lowWitness.nextIndex, existingPublicData);

      return result;
    }
    // This is an insertion of a new entry
    const lowSiblingPath =
      this.publicDataTree.getSiblingPath(computePublicDataHash(lowWitness), index) ??
      (await this.treeDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, index)).toFields();
    const oldLowWitness = lowWitness.clone();

    // The newly inserted public data leaf will inherit the low nullifier's "next" values.
    const newPublicDataNode = new PublicDataTreeLeafPreimage(slot, newValue, lowWitness.nextSlot, lowWitness.nextIndex);
    const newPublicDataNodeHash = computePublicDataHash(newPublicDataNode);
    const insertionIndex = this.publicDataTree.leafCount;

    lowWitness.nextSlot = slot;
    lowWitness.nextIndex = insertionIndex;
    const lowWitnessHash = computePublicDataHash(lowWitness);
    this.publicDataUpdates.set(index, lowWitness);
    this.publicDataTree.updateLeaf(lowWitnessHash, index);

    let newPublicDataSiblingPath = this.publicDataTree.getSiblingPath(newPublicDataNodeHash, insertionIndex);
    if (newPublicDataSiblingPath === undefined) {
      // Do we append zero just to get the sibling path?
      this.publicDataTree.appendLeaf(Fr.zero());
      newPublicDataSiblingPath = this.publicDataTree.getSiblingPath(newPublicDataNodeHash, insertionIndex)!;
      this.publicDataTree.updateLeaf(newPublicDataNodeHash, insertionIndex);
    } else {
      this.publicDataTree.appendLeaf(newPublicDataNodeHash);
    }

    // Update the public data tree
    // The low Read will have the new node slot as its next value

    // Update the local map - indexed by insertion order
    this.publicDataUpdates.set(insertionIndex, newPublicDataNode);

    // Build Result struc
    const result = {
      leafIndex: insertionIndex /** leaf index **/,
      insertionPath: newPublicDataSiblingPath,
      lowSiblingPath: lowSiblingPath,
      lowWitness: {
        preimage: oldLowWitness,
        index,
      },
    };

    // Now we update our view of what the minimum nullifier in our set is
    // Should probably clean this up
    if (this.minPublicData === undefined) {
      this.minPublicData = newPublicDataNode;
      this.minPublicDataIndex = this.publicDataTree.leafCount;
    }
    // We do <= here because the nullifier value might be the same but the next values change (i.e. Low nullifier updated)
    if (newPublicDataNode.slot <= this.minPublicData.slot) {
      this.minPublicData = newPublicDataNode;
      this.minNullifierIndex = this.publicDataTree.leafCount;
    }
    if (lowWitness.slot <= this.minPublicData.slot) {
      this.minPublicData = lowWitness;
      this.minPublicDataIndex = index;
    }
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

  getSiblingPath(value: Fr, index: bigint): Fr[] | undefined {
    const searchPath = this._derivePathLE(index);
    // Handle cases where we error out
    const { path, status } = this._getSiblingPath(value, searchPath, this.tree, []);
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
    return this._hashTree(this.tree);
  }

  public _hashTree(tree: Tree): Fr {
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return poseidon2Hash([this._hashTree(tree.leftTree), this._hashTree(tree.rightTree)]);
      }
      case TreeType.LEAF: {
        return tree.value;
      }
      case TreeType.EMPTY: {
        return Fr.zero();
      }
    }
  }

  public getNode(index: bigint): Tree {
    const path = this._derivePathLE(index);
    return this._getNode(path, this.tree);
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

  private _getSiblingPath(value: Fr, searchPath: number[], tree: Tree, acc: Fr[]): AccumulatedSiblingPath {
    // If we have reached the end of the path, we should be at a leaf or empty node
    // If it is a leaf, we check if the value is equal to the leaf value
    // If it is empty we check if the value is equal to zero
    if (searchPath.length === 0) {
      switch (tree.tag) {
        case TreeType.LEAF:
          return value.equals(tree.value)
            ? { path: acc, status: SiblingStatus.MEMBER }
            : { path: acc, status: SiblingStatus.NONMEMBER };
        case TreeType.EMPTY:
          return value.equals(Fr.ZERO)
            ? { path: acc, status: SiblingStatus.MEMBER }
            : { path: acc, status: SiblingStatus.NONMEMBER };
        case TreeType.BRANCH:
          console.log('unexpected end of path');
          return { path: [], status: SiblingStatus.ERROR };
      }
    }
    // Keep exploring here
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return searchPath.pop() === 0
          ? this._getSiblingPath(value, searchPath, tree.leftTree, [this._hashTree(tree.rightTree)].concat(acc))
          : this._getSiblingPath(value, searchPath, tree.rightTree, [this._hashTree(tree.leftTree)].concat(acc));
      }
      // In these two situations we are exploring a subtree we dont have information about
      // We should return an error and look inside the DB
      case TreeType.LEAF:
      case TreeType.EMPTY: {
        // Temp Helpful log
        console.log('Exploring a subtree we dont have information about');
        return { path: [], status: SiblingStatus.ERROR };
      }
    }
  }
}
