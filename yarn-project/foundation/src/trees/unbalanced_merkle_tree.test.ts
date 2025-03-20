import { findLeafLevelAndIndex } from './unbalanced_merkle_tree.js';

describe('findLeafLevelAndIndex', () => {
  it('findLeafLevelAndIndex', () => {
    expect(findLeafLevelAndIndex(1, 0)).toEqual({ level: 0, indexAtLevel: 0 });

    expect(findLeafLevelAndIndex(2, 0)).toEqual({ level: 1, indexAtLevel: 0 });
    expect(findLeafLevelAndIndex(2, 1)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(3, 0)).toEqual({ level: 2, indexAtLevel: 0 });
    expect(findLeafLevelAndIndex(3, 1)).toEqual({ level: 2, indexAtLevel: 1 });
    expect(findLeafLevelAndIndex(3, 2)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(4, 2)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(5, 2)).toEqual({ level: 3, indexAtLevel: 2 });
    expect(findLeafLevelAndIndex(5, 4)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(6, 4)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(7, 4)).toEqual({ level: 3, indexAtLevel: 4 });
    expect(findLeafLevelAndIndex(7, 6)).toEqual({ level: 2, indexAtLevel: 3 });

    expect(findLeafLevelAndIndex(8, 6)).toEqual({ level: 3, indexAtLevel: 6 });

    expect(findLeafLevelAndIndex(9, 6)).toEqual({ level: 4, indexAtLevel: 6 });
    expect(findLeafLevelAndIndex(9, 8)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(10, 8)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(11, 8)).toEqual({ level: 3, indexAtLevel: 4 });

    expect(findLeafLevelAndIndex(12, 8)).toEqual({ level: 3, indexAtLevel: 4 });

    expect(findLeafLevelAndIndex(13, 8)).toEqual({ level: 4, indexAtLevel: 8 });

    expect(findLeafLevelAndIndex(14, 8)).toEqual({ level: 4, indexAtLevel: 8 });
    expect(findLeafLevelAndIndex(14, 11)).toEqual({ level: 4, indexAtLevel: 11 });
    expect(findLeafLevelAndIndex(14, 12)).toEqual({ level: 3, indexAtLevel: 6 });
  });
});
