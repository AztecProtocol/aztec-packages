import { jest } from '@jest/globals';

// Contrived example
class Tree {
  constructor() {}
}

class State {
  constructor(private publicTree: Tree, private privateTree: Tree) {}
  getPrivateTree(): Tree {
    return this.publicTree;
  }
  getPublicTree(): Tree {
    return this.privateTree;
  }
}

describe('block_context', () => {});
