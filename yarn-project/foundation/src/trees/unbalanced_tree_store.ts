import { findLeafLevelAndIndex } from './unbalanced_merkle_tree.js';

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

  getLeaf(leafIndex: number) {
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
