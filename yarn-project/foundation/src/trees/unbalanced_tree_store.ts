export interface TreeNodeLocation {
  level: number;
  index: number;
}

interface TreeNode<T> {
  value: T;
  location: TreeNodeLocation;
}

export class UnbalancedTreeStore<T> {
  #nodeMapping: Map<string, TreeNode<T>> = new Map();
  readonly #numLeaves: number;

  constructor(numLeaves: number) {
    this.#numLeaves = numLeaves;
  }

  setLeaf(leafIndex: number, value: T): TreeNodeLocation {
    if (leafIndex >= this.#numLeaves) {
      throw new Error(`Expected at most ${this.#numLeaves} leaves. Received a leaf at index ${leafIndex}.`);
    }

    const { level, indexAtLevel } = findLeafLevelAndIndex(this.#numLeaves, leafIndex);
    const location = {
      level,
      index: indexAtLevel,
    };
    this.#nodeMapping.set(this.#getKey(location), {
      location,
      value,
    });
    return location;
  }

  setNode({ level, index }: TreeNodeLocation, value: T) {
    const location = {
      level,
      index,
    };
    this.#nodeMapping.set(this.#getKey(location), {
      location,
      value,
    });
  }

  getParentLocation({ level, index }: TreeNodeLocation): TreeNodeLocation {
    if (level === 0) {
      throw new Error('Tree root does not have a parent.');
    }

    return { level: level - 1, index: Math.floor(index / 2) };
  }

  getSiblingLocation({ level, index }: TreeNodeLocation): TreeNodeLocation {
    if (level === 0) {
      throw new Error('Tree root does not have a sibling.');
    }

    return { level, index: index % 2 ? index - 1 : index + 1 };
  }

  getChildLocations({ level, index }: TreeNodeLocation): [TreeNodeLocation, TreeNodeLocation] {
    const left = { level: level + 1, index: index * 2 };
    const right = { level: level + 1, index: index * 2 + 1 };
    return [left, right];
  }

  getLeaf(leafIndex: number): T | undefined {
    const { level, indexAtLevel } = findLeafLevelAndIndex(this.#numLeaves, leafIndex);
    const location = {
      level,
      index: indexAtLevel,
    };
    return this.getNode(location);
  }

  getNode(location: TreeNodeLocation): T | undefined {
    return this.#nodeMapping.get(this.#getKey(location))?.value;
  }

  getRoot(): T | undefined {
    return this.getNode({ level: 0, index: 0 });
  }

  getParent(location: TreeNodeLocation): T | undefined {
    const parentLocation = this.getParentLocation(location);
    return this.getNode(parentLocation);
  }

  getSibling(location: TreeNodeLocation): T | undefined {
    const siblingLocation = this.getSiblingLocation(location);
    return this.getNode(siblingLocation);
  }

  getChildren(location: TreeNodeLocation): [T | undefined, T | undefined] {
    const [left, right] = this.getChildLocations(location);
    return [this.getNode(left), this.getNode(right)];
  }

  #getKey(location: TreeNodeLocation) {
    return `${location.level}-${location.index}`;
  }
}

/// Get the depth of the maximum balanced tree that can be created with the given number of leaves. The subtree will be
/// the left most subtree of the unbalanced tree with a total of `numLeaves` leaves.
///
/// Note: All the leaves may not be used to form the tree. For example, if there are 5 leaves, the maximum depth is 2,
/// only 4 leaves are used to form a balanced tree.
function getMaxBalancedSubtreeDepth(numLeaves: number) {
  return Math.floor(Math.log2(numLeaves));
}

/// Get the maximum depth of an unbalanced tree that can be created with the given number of leaves.
function getMaxUnbalancedTreeDepth(numLeaves: number) {
  return Math.ceil(Math.log2(numLeaves));
}

function findPosition(
  rootLevel: number,
  leafLevel: number,
  numLeaves: number,
  indexOffset: number,
  targetIndex: number,
): { level: number; indexAtLevel: number } {
  if (numLeaves <= 1) {
    // Single leaf.
    return { level: rootLevel, indexAtLevel: indexOffset };
  }

  // The largest balanced tree that can be created with the given number of leaves.
  const maxBalancedTreeDepth = getMaxBalancedSubtreeDepth(numLeaves);
  const numBalancedLeaves = 2 ** maxBalancedTreeDepth;
  const numRemainingLeaves = numLeaves - numBalancedLeaves;

  if (targetIndex < numBalancedLeaves) {
    // Target is in the balanced tree.

    // - If numRemainingLeaves is 0: this balanced tree is grown from the current root.
    // - If numRemainingLeaves is not 0: the remaining leaves will form another tree, which will become the right child of the root.
    //   And the balanced tree will be the left child of the root.
    //   There will be an extra level between the root of the balanced tree and the current root.
    const extraLevel = numRemainingLeaves ? 1 : 0;

    return { level: rootLevel + maxBalancedTreeDepth + extraLevel, indexAtLevel: indexOffset + targetIndex };
  } else {
    // Target is in the right branch.
    const rightBranchMaxLevel = getMaxUnbalancedTreeDepth(numRemainingLeaves);
    const shiftedUp = leafLevel - rootLevel - rightBranchMaxLevel - 1;
    const nextLeafLevel = leafLevel - shiftedUp;
    const newIndexOffset = (indexOffset + numBalancedLeaves) >> shiftedUp;
    const shiftedTargetIndex = targetIndex - numBalancedLeaves;
    return findPosition(rootLevel + 1, nextLeafLevel, numRemainingLeaves, newIndexOffset, shiftedTargetIndex);
  }
}

export function findLeafLevelAndIndex(numLeaves: number, leafIndex: number) {
  const maxLevel = getMaxUnbalancedTreeDepth(numLeaves);
  return findPosition(0, maxLevel, numLeaves, 0, leafIndex);
}
