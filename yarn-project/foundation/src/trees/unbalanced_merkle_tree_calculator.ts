import { type Hasher, shaMerkleHash } from './hasher.js';
import { SiblingPath } from './sibling_path.js';
import { type TreeNodeLocation, UnbalancedTreeStore } from './unbalanced_tree_store.js';

interface TreeNode {
  value: Buffer;
  leafIndex?: number;
}

/**
 * An ephemeral unbalanced Merkle tree implementation.
 * Follows the rollup implementation which greedily hashes pairs of nodes up the tree.
 * Remaining rightmost nodes are shifted up until they can be paired.
 * The values that match the `valueToCompress` are skipped and the sibling of the compressed leaf are shifted up until
 * they can be paired.
 * If there is only one leaf, the root is the leaf.
 */
export class UnbalancedMerkleTreeCalculator {
  private store: UnbalancedTreeStore<TreeNode>;
  private leafLocations: TreeNodeLocation[] = [];

  public constructor(
    private readonly leaves: Buffer[],
    private readonly valueToCompress: Buffer,
    private readonly emptyRoot: Buffer,
    private readonly hasher: Hasher['hash'],
  ) {
    this.store = new UnbalancedTreeStore(leaves.length);
    this.buildTree();
  }

  static create(
    leaves: Buffer[],
    valueToCompress = Buffer.alloc(0),
    emptyRoot = Buffer.alloc(32),
    hasher = shaMerkleHash,
  ) {
    return new UnbalancedMerkleTreeCalculator(leaves, valueToCompress, emptyRoot, hasher);
  }

  /**
   * Returns the root of the tree.
   * @returns The root of the tree.
   */
  public getRoot(): Buffer {
    return this.store.getRoot()!.value;
  }

  /**
   * Returns a sibling path for the element.
   * @param value - The value of the element.
   * @returns A sibling path for the element.
   * Note: The sibling path is an array of sibling hashes, with the lowest hash (leaf hash) first, and the highest hash last.
   */
  public getSiblingPath<N extends number>(value: Buffer): SiblingPath<N> {
    const leafIndex = this.leaves.findIndex(leaf => leaf.equals(value));
    if (leafIndex === -1) {
      throw Error(`Leaf value ${value.toString('hex')} not found in tree.`);
    }

    return this.getSiblingPathByLeafIndex(leafIndex);
  }

  /**
   * Returns a sibling path for the leaf at the given index.
   * @param leafIndex - The index of the leaf.
   * @returns A sibling path for the leaf.
   */
  public getSiblingPathByLeafIndex<N extends number>(leafIndex: number): SiblingPath<N> {
    if (leafIndex >= this.leaves.length) {
      throw Error(`Leaf index ${leafIndex} out of bounds. Tree has ${this.leaves.length} leaves.`);
    }

    const leaf = this.leaves[leafIndex];
    if (leaf.equals(this.valueToCompress)) {
      throw Error(`Leaf at index ${leafIndex} has been compressed.`);
    }

    const path: Buffer[] = [];
    let location = this.leafLocations[leafIndex];
    while (location.level > 0) {
      const sibling = this.store.getSibling(location)!;
      path.push(sibling.value);
      location = this.store.getParentLocation(location);
    }

    return new SiblingPath<N>(path.length as N, path);
  }

  public getLeafLocation(leafIndex: number) {
    return this.leafLocations[leafIndex];
  }

  /**
   * Adds leaves and nodes to the store. Updates the leafLocations.
   * @param leaves - The leaves of the tree.
   */
  private buildTree() {
    this.leafLocations = this.leaves.map((value, i) => this.store.setLeaf(i, { value, leafIndex: i }));

    // Start with the leaves that are not compressed.
    let toProcess = this.leafLocations.filter((_, i) => !this.leaves[i].equals(this.valueToCompress));
    if (!toProcess.length) {
      // All leaves are compressed. Set empty root to the root.
      this.store.setNode({ level: 0, index: 0 }, { value: this.emptyRoot });
      return;
    }

    const level = toProcess[0].level;
    for (let i = level; i > 0; i--) {
      const toProcessNext = [];
      for (const location of toProcess) {
        if (location.level !== i) {
          toProcessNext.push(location);
          continue;
        }

        const parentLocation = this.store.getParentLocation(location);
        if (this.store.getNode(parentLocation)) {
          // Parent has been updated by its (left) sibling.
          continue;
        }

        const sibling = this.store.getSibling(location);
        // If sibling is undefined, all its children are compressed.
        const shouldShiftUp = !sibling || sibling.value.equals(this.valueToCompress);
        if (shouldShiftUp) {
          // The node becomes the parent if the sibling is a compressed leaf.
          this.shiftNodeUp(location, parentLocation);
        } else {
          // Hash the value with the (right) sibling and update the parent node.
          const node = this.store.getNode(location)!;
          const parentValue = this.hasher(node.value, sibling.value);
          this.store.setNode(parentLocation, { value: parentValue });
        }

        // Add the parent location to be processed next.
        toProcessNext.push(parentLocation);
      }

      toProcess = toProcessNext;
    }
  }

  private shiftNodeUp(from: TreeNodeLocation, to: TreeNodeLocation) {
    // Collect all nodes that need to shift.
    const nodesToShift = this.collectNodesToShift(from, to);
    // Move all nodes to their new locations.
    for (const { node, newLocation } of nodesToShift) {
      this.store.setNode(newLocation, node);
      if (node.leafIndex !== undefined) {
        this.leafLocations[node.leafIndex] = newLocation;
      }
    }
  }

  private collectNodesToShift(from: TreeNodeLocation, to: TreeNodeLocation) {
    const node = this.store.getNode(from);
    if (!node) {
      return [];
    }

    let result = [{ node, newLocation: to }];

    // If not a leaf, collect its children.
    if (node.leafIndex === undefined) {
      const [leftChild, rightChild] = this.store.getChildLocations(from);
      const [leftChildNew, rightChildNew] = this.store.getChildLocations(to);
      result = result
        .concat(this.collectNodesToShift(leftChild, leftChildNew))
        .concat(this.collectNodesToShift(rightChild, rightChildNew));
    }

    return result;
  }
}
