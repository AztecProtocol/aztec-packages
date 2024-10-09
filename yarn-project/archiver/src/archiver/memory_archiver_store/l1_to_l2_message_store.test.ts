import { InboxLeaf } from '@aztec/circuit-types';
import { Fr } from '@aztec/foundation/fields';

import { L1ToL2MessageStore } from './l1_to_l2_message_store.js';

describe('l1_to_l2_message_store', () => {
  let store: L1ToL2MessageStore;

  beforeEach(() => {
    // already adds a message to the store
    store = new L1ToL2MessageStore();
  });

  it('adds a message and correctly returns its index', () => {
    const blockNumber = 236n;
    const msgs = Array.from({ length: 10 }, (_, i) => {
      return InboxLeaf.createInboxLeafUsingIndexInSubtree(blockNumber, BigInt(i), Fr.random());
    });
    for (const m of msgs) {
      store.addMessage(m);
    }

    const retrievedMsgs = store.getMessages(blockNumber);
    expect(retrievedMsgs.length).toEqual(10);

    const msg = msgs[4];
    const expectedIndexInWholeTree = store.getMessageIndex(msg.leaf, 0n)!;
    expect(expectedIndexInWholeTree).toEqual(InboxLeaf.convertToIndexInWholeTree(4n, blockNumber));
  });

  it('correctly handles duplicate messages', () => {
    const messageHash = Fr.random();

    store.addMessage(InboxLeaf.createInboxLeafUsingIndexInSubtree(1n, 0n, messageHash));
    store.addMessage(InboxLeaf.createInboxLeafUsingIndexInSubtree(2n, 0n, messageHash));

    const index1 = store.getMessageIndex(messageHash, 0n)!;
    const index2 = store.getMessageIndex(messageHash, index1 + 1n);

    expect(index2).toBeDefined();
    expect(index2).toBeGreaterThan(index1);
  });
});
