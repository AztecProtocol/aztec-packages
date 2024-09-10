/**
 * Calculates the index and level of the parent rollup circuit
 * Based on tree implementation in unbalanced_tree.ts -> batchInsert()
 */
export function findMergeLevel(currentLevel: bigint, currentIndex: bigint, totalElements: bigint) {
  const numMergeLevels = BigInt(Math.ceil(Math.log2(Number(totalElements))) - 1);
  const moveUpMergeLevel = (levelSize: bigint, index: bigint, nodeToShift: boolean) => {
    levelSize /= 2n;
    if (levelSize & 1n) {
      [levelSize, nodeToShift] = nodeToShift ? [levelSize + 1n, false] : [levelSize - 1n, true];
    }
    index >>= 1n;
    return { thisLevelSize: levelSize, thisIndex: index, shiftUp: nodeToShift };
  };
  let [thisLevelSize, shiftUp] = totalElements & 1n ? [totalElements - 1n, true] : [totalElements, false];
  const maxLevel = numMergeLevels + 1n;
  let placeholder = currentIndex;
  for (let i = 0; i < maxLevel - currentLevel; i++) {
    ({ thisLevelSize, thisIndex: placeholder, shiftUp } = moveUpMergeLevel(thisLevelSize, placeholder, shiftUp));
  }
  let thisIndex = currentIndex;
  let mergeLevel = currentLevel;
  while (thisIndex >= thisLevelSize && mergeLevel != 0n) {
    mergeLevel -= 1n;
    ({ thisLevelSize, thisIndex, shiftUp } = moveUpMergeLevel(thisLevelSize, thisIndex, shiftUp));
  }
  return [mergeLevel - 1n, thisIndex >> 1n, thisIndex & 1n];
}
