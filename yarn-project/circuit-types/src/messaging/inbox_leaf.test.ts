import { Fr } from '@aztec/circuits.js';

import { InboxLeaf } from './inbox_leaf.js';

describe('convert index in whole tree to subtree', () => {
  it.each([0n, 1n, 15n, 100n])('for 1st l2 block', indexInSubtree => {
    const msg = new InboxLeaf(1n, indexInSubtree, Fr.random());
    expect(msg.convertToIndexInSubtree()).toBe(indexInSubtree);
  });

  it.each([0n, 1n, 15n, 100n])('for 2nd block', indexInSubtree => {
    const msg = InboxLeaf.createInboxLeafUsingIndexInSubtree(2n, indexInSubtree, Fr.random());
    expect(msg.convertToIndexInSubtree()).toBe(indexInSubtree);
  });

  it.each([0n, 1n, 15n, 100n])('for 100th block', indexInSubtree => {
    const msg = InboxLeaf.createInboxLeafUsingIndexInSubtree(100n, indexInSubtree, Fr.random());
    expect(msg.convertToIndexInSubtree()).toBe(indexInSubtree);
  });
});
