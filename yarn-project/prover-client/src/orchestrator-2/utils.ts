type TreeNodeLocation = {
  /** Level of the node in the tree. Leaves are considered level zero. */
  level: number;
  /** Index of the node within its level. */
  indexWithinLevel: number;
  /** Whether it's a left or a right node (0 for left, 1 for right). */
  indexLeftOrRight: number;
  /** Index of the node within a flattened representation of the tree in level ordering. */
  indexWithinTree: number;
};

/**
 * Calculates the index and level of the parent rollup circuit in the proving tree
 * Based on tree implementation in UnbalancedTree.batchInsert
 * @returns A TreeNodeLocation locating the parent node
 */
export function getMergeLocation(args: { level: number; index: number; total: number }): TreeNodeLocation {
  const { level: currentLevel, index: currentIndex, total } = args;
  const numMergeLevels = Math.ceil(Math.log2(total)) - 1;

  const moveUpMergeLevel = (levelSize: number, index: number, nodeToShift: boolean) => {
    levelSize /= 2;
    if (levelSize & 1) {
      [levelSize, nodeToShift] = nodeToShift ? [levelSize + 1, false] : [levelSize - 1, true];
    }
    index >>= 1;
    return { thisLevelSize: levelSize, thisIndex: index, shiftUp: nodeToShift };
  };

  let [thisLevelSize, shiftUp] = total & 1 ? [total - 1, true] : [total, false];
  const maxLevel = numMergeLevels + 1;
  let placeholder = currentIndex;
  for (let i = 0; i < maxLevel - currentLevel; i++) {
    ({ thisLevelSize, thisIndex: placeholder, shiftUp } = moveUpMergeLevel(thisLevelSize, placeholder, shiftUp));
  }
  let thisIndex = currentIndex;
  let mergeLevel = currentLevel;
  while (thisIndex >= thisLevelSize && mergeLevel != 0) {
    mergeLevel -= 1;
    ({ thisLevelSize, thisIndex, shiftUp } = moveUpMergeLevel(thisLevelSize, thisIndex, shiftUp));
  }

  const level = mergeLevel - 1;
  const indexWithinLevel = thisIndex >> 1;
  return {
    level,
    indexWithinLevel,
    indexLeftOrRight: thisIndex & 1,
    indexWithinTree: 2 ** level - 1 + indexWithinLevel,
  };
}
