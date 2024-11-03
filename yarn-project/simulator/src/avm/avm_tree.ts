import { MerkleTreeId } from '@aztec/circuit-types';
import { MerkleTreeReadOperations } from '@aztec/circuit-types';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

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
/****** The EphemeralAvmTree Class *****************/
/****************************************************/
export class EphemeralAvmTree {
  public tree: Tree;
  public zeroHashes: Fr[];
  public leafCount;
  public frontier: Fr[] = [];

  private constructor(public forkedLeafCount: bigint, public depth: number) {
    let zeroHash = Fr.zero();
    const zeroHashes = [zeroHash];
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
  ): Promise<EphemeralAvmTree> {
    const tree = new EphemeralAvmTree(forkedLeafCount, depth);
    await tree.initializeFrontier(treeDb);
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

  getSiblingPath(value: Fr, index: bigint): Fr[] {
    const searchPath = this._derivePathLE(index);
    // Handle cases where we error out
    const { path } = this._getSiblingPath(value, searchPath, this.tree, []);
    return path;
  }

  insertSiblingPath(index: bigint, siblingPath: Fr[]): void {
    for (let i = 0; i < siblingPath.length; i++) {
      // Flip(XOR) the last bit because we are inserting siblings of the leaf
      const sibIndex = index ^ 1n;
      this.updateLeaf(siblingPath[i], sibIndex, this.depth - i);
      index >> 1n;
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

  async initializeFrontier(treeDb: MerkleTreeReadOperations): Promise<void> {
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
      const path = await treeDb.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, index);

      const frontierPath = this._derivePathLE(BigInt(frontierIndices[i]), this.depth - i);
      siblingValue.push(path.toFields()[i]);
      this.tree = this._insertLeaf(siblingValue[i], frontierPath, this.depth - i, this.tree, true);
    }

    this.frontier = siblingValue;
  }

  public getRoot(): Fr {
    return this._hashTree(this.tree);
  }

  private _hashTree(tree: Tree): Fr {
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
  getNode(nodePath: number[], tree: Tree): Tree {
    if (nodePath.length === 0) {
      return tree;
    }
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return nodePath.pop() === 0 ? this.getNode(nodePath, tree.leftTree) : this.getNode(nodePath, tree.rightTree);
      }
      case TreeType.LEAF:
      case TreeType.EMPTY: {
        return tree;
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
        const zeroLeaf = appendMode ? Leaf(this.zeroHashes[depth]) : Empty();
        return insertPath.pop() === 0
          ? Branch(this._insertLeaf(value, insertPath, depth - 1, zeroLeaf, appendMode), zeroLeaf)
          : Branch(zeroLeaf, this._insertLeaf(value, insertPath, depth - 1, zeroLeaf, appendMode));
      }
    }
  }

  private _getSiblingPath(value: Fr, searchPath: number[], tree: Tree, acc: Fr[]): AccumulatedSiblingPath {
    if (searchPath.length === 0) {
      if (tree.tag === TreeType.LEAF) {
        return value.equals(tree.value)
          ? { path: acc, status: SiblingStatus.MEMBER }
          : { path: acc, status: SiblingStatus.NONMEMBER };
      } else if (tree.tag === TreeType.EMPTY) {
        return value.equals(Fr.ZERO)
          ? { path: acc, status: SiblingStatus.MEMBER }
          : { path: acc, status: SiblingStatus.NONMEMBER };
      } else {
        console.log('unexpected end of path');
        return { path: [], status: SiblingStatus.ERROR };
      }
    }
    switch (tree.tag) {
      case TreeType.BRANCH: {
        return searchPath.pop() === 0
          ? this._getSiblingPath(value, searchPath, tree.leftTree, [this._hashTree(tree.rightTree)].concat(acc))
          : this._getSiblingPath(value, searchPath, tree.rightTree, [this._hashTree(tree.leftTree)].concat(acc));
      }
      case TreeType.LEAF: {
        console.log('UNexepected leaf');
        return { path: [], status: SiblingStatus.ERROR };
      }
      case TreeType.EMPTY: {
        console.log('unexpected empty');
        return { path: [], status: SiblingStatus.ERROR };
      }
    }
  }
}
