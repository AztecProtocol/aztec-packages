import { Fr } from '@aztec/foundation/fields';

import { computeL2ToL1MembershipWitnessFromMessagesForAllTxs } from './l2_to_l1_membership.js';

describe('L2 to L1 membership', () => {
  const generateMsgHashes = (numMsgs: number) => {
    return Array.from({ length: numMsgs }, () => Fr.random());
  };

  it('throws if the message is not found', () => {
    const messagesForAllTxs = [generateMsgHashes(3), generateMsgHashes(1)];
    const targetMsg = Fr.random();
    expect(() => computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, targetMsg)).toThrow(
      'The L2ToL1Message you are trying to prove inclusion of does not exist',
    );
  });

  it('a single tx with 1 message', () => {
    const txMessages = generateMsgHashes(1);
    const messagesForAllTxs = [txMessages];

    const targetMsg = txMessages[0];
    const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, targetMsg);
    expect(witness.leafIndex).toBe(0n);
    expect(witness.siblingPath.pathSize).toBe(0);
  });

  it('a single tx with 2 messages', () => {
    const txMessages = generateMsgHashes(2);
    const messagesForAllTxs = [txMessages];

    {
      const m0 = txMessages[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      expect(witness.leafIndex).toBe(0n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }

    {
      const m1 = txMessages[1];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m1);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }
  });

  it('a single tx with messages in a wonky tree', () => {
    //       tx
    //      /   \
    //     .    m2
    //   /   \
    // m0   m1
    const txMessages = generateMsgHashes(3);
    const messagesForAllTxs = [txMessages];

    {
      const m0 = txMessages[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      expect(witness.leafIndex).toBe(0n);
      expect(witness.siblingPath.pathSize).toBe(2);
    }

    {
      const m1 = txMessages[1];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m1);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(2);
    }

    {
      const m2 = txMessages[2];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }
  });

  it('2 txs, one has 0 messages, one has 1 message', () => {
    //       root     ---->   m0
    //      /   \
    //    []    [m0]

    const txMessages1 = generateMsgHashes(1);
    const messagesForAllTxs = [[], txMessages1];

    const m0 = txMessages1[0];
    const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
    expect(witness.leafIndex).toBe(0n);
    expect(witness.siblingPath.pathSize).toBe(0);
    expect(witness.root).toEqual(m0);
  });

  it('multiple txs in a wonky tree, each tx has 1 message', () => {
    //       root
    //      /   \
    //     .    [m2]
    //   /   \
    // [m0] [m1]

    const txMessages0 = generateMsgHashes(1);
    const txMessages1 = generateMsgHashes(1);
    const txMessages2 = generateMsgHashes(1);
    const messagesForAllTxs = [txMessages0, txMessages1, txMessages2];

    {
      const m0 = txMessages0[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      expect(witness.leafIndex).toBe(0n);
      expect(witness.siblingPath.pathSize).toBe(2);
    }

    {
      const m1 = txMessages1[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m1);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(2);
    }

    {
      const m2 = txMessages2[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }
  });

  it('multiple txs in a wonky tree, one tx has 0 messages', () => {
    //       root      ---->    root
    //      /   \              /   \
    //     .   [m2]           m0   m2
    //   /   \
    // [m0]  []

    const txMessages0 = generateMsgHashes(1);
    const txMessages2 = generateMsgHashes(1);
    // tx1 has no messages.
    const messagesForAllTxs = [txMessages0, [], txMessages2];

    {
      const m0 = txMessages0[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      expect(witness.leafIndex).toBe(0n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }

    {
      const m2 = txMessages2[0];
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      expect(witness.leafIndex).toBe(1n);
      expect(witness.siblingPath.pathSize).toBe(1);
    }
  });

  it('multiple txs in a wonky tree, each tx has messages in a balanced tree', () => {
    //       root
    //      /   \
    //     .    tx2
    //   /   \
    // tx0  tx1

    const txMessages0 = generateMsgHashes(2);
    const txMessages1 = generateMsgHashes(4);
    const txMessages2 = generateMsgHashes(2);
    const messagesForAllTxs = [txMessages0, txMessages1, txMessages2];

    {
      //    tx0
      //   /   \
      // m0   m1

      // m0
      const m0 = txMessages0[0];
      const witness0 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      // 2 edges from root to tx0, 1 edge from tx0 to m0
      expect(witness0.siblingPath.pathSize).toBe(2 + 1);
      // The leaf is at index 0n in its tx subtree (height = 1), which has no tx subtrees on its left.
      expect(witness0.leafIndex).toBe(0n);
    }

    {
      //      tx1
      //     /   \
      //    .    .
      //  /  \  /  \
      // m0 m1 m2 m3

      // m0
      const m0 = txMessages1[0];
      const witness0 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      // 2 edges from root to tx1, 2 edges from tx1 to m0
      expect(witness0.siblingPath.pathSize).toBe(2 + 2);
      // The leaf is at index 0n in its tx subtree (height = 2), which has 1 tx subtree on its left.
      expect(witness0.leafIndex).toBe(0n + 1n * (1n << 2n));

      // m2
      const m2 = txMessages1[2];
      const witness2 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      // 2 edges from root to tx1, 2 edges from tx1 to m2
      expect(witness2.siblingPath.pathSize).toBe(2 + 2);
      // The leaf is at index 2n in its tx subtree (height = 2), which has 1 tx subtree on its left.
      expect(witness2.leafIndex).toBe(2n + 1n * (1n << 2n));
    }

    {
      //    tx2
      //   /   \
      // m0   m1

      // m0
      const m1 = txMessages2[1];
      const witness1 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m1);
      // 1 edge from root to tx2, 1 edge from tx2 to m1
      expect(witness1.siblingPath.pathSize).toBe(1 + 1);
      // The leaf is at index 1n in its tx subtree (height = 1), which has 1 tx subtree on its left.
      expect(witness1.leafIndex).toBe(1n + 1n * (1n << 1n));
    }
  });

  it('multiple txs in a wonky tree, each tx has messages in a wonky tree', () => {
    //       root
    //      /   \
    //     .    tx2
    //   /   \
    // tx0  tx1

    const txMessages0 = generateMsgHashes(5);
    const txMessages1 = generateMsgHashes(3);
    const txMessages2 = generateMsgHashes(7);
    const messagesForAllTxs = [txMessages0, txMessages1, txMessages2];

    {
      //        tx0
      //        /  \
      //       .    m4
      //     /   \
      //    .    .
      //  /  \  /  \
      // m0 m1 m2 m3

      // m2
      const m2 = txMessages0[2];
      const witness2 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      // 2 edges from root to tx0, 3 edges from tx0 to m2
      expect(witness2.siblingPath.pathSize).toBe(2 + 3);
      // The leaf is at index 2n in its tx subtree (height = 3), which has no tx subtrees on its left.
      expect(witness2.leafIndex).toBe(2n);

      // m4
      const m4 = txMessages0[4];
      const witness4 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m4);
      // 2 edges from root to tx0, 1 edge from tx0 to m4
      expect(witness4.siblingPath.pathSize).toBe(2 + 1);
      // The leaf is at index 1n in its tx subtree (height = 1), which has no tx subtrees on its left.
      expect(witness4.leafIndex).toBe(1n);
    }

    {
      //       tx1
      //      /   \
      //     .    m2
      //   /   \
      // m0   m1

      // m0
      const m0 = txMessages1[0];
      const witness0 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      // 2 edges from root to tx1, 2 edges from tx1 to m0
      expect(witness0.siblingPath.pathSize).toBe(2 + 2);
      // The leaf is at index 0n in its tx subtree (height = 2), which has 1 tx subtree on its left.
      expect(witness0.leafIndex).toBe(0n + 1n * (1n << 2n));

      // m2
      const m2 = txMessages1[2];
      const witness2 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      // 2 edges from root to tx1, 1 edge from tx1 to m2
      expect(witness2.siblingPath.pathSize).toBe(2 + 1);
      // The leaf is at index 1n in its tx subtree (height = 1), which has 1 tx subtree on its left.
      expect(witness2.leafIndex).toBe(1n + 1n * (1n << 1n));
    }

    {
      //           tx2
      //        /        \
      //       .          .
      //     /   \       / \
      //    .    .      .  m6
      //  /  \  /  \   / \
      // m0 m1 m2 m3  m4  m5

      // m3
      const m3 = txMessages2[3];
      const witness3 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m3);
      // 1 edge from root to tx2, 3 edges from tx2 to m3
      expect(witness3.siblingPath.pathSize).toBe(1 + 3);
      // The leaf is at index 3n in its tx subtree (height = 3), which has 1 tx subtree on its left.
      expect(witness3.leafIndex).toBe(3n + 1n * (1n << 3n));

      // m4
      const m4 = txMessages2[4];
      const witness4 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m4);
      // 1 edge from root to tx2, 3 edges from tx2 to m4
      expect(witness4.siblingPath.pathSize).toBe(1 + 3);
      // The leaf is at index 4n in its tx subtree (height = 3), which has 1 tx subtree on its left.
      expect(witness4.leafIndex).toBe(4n + 1n * (1n << 3n));

      // m6
      const m6 = txMessages2[6];
      const witness6 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m6);
      // 1 edge from root to tx2, 2 edges from tx2 to m6
      expect(witness6.siblingPath.pathSize).toBe(1 + 2);
      // The leaf is at index 3n in its tx subtree (height = 2), which has 1 tx subtree on its left.
      expect(witness6.leafIndex).toBe(3n + 1n * (1n << 2n));
    }
  });

  it('multiple txs in a wonky tree, some txs have 0 messages, other txs have more than 1 message', () => {
    //              root        ---->     root
    //         /          \              /   \
    //         .          .            tx2   tx6
    //      /    \       /  \
    //    .      .      .   tx6
    //   /  \   /  \   /  \
    //  [] [] tx2 []  [] []

    const txMessages2 = generateMsgHashes(3);
    const txMessages6 = generateMsgHashes(7);
    const messagesForAllTxs = [[], [], txMessages2, [], [], [], txMessages6];

    {
      //       tx2
      //      /   \
      //     .    m2
      //   /   \
      // m0   m1

      // m0
      const m0 = txMessages2[0];
      const witness0 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m0);
      // 1 edge from root to tx2, 2 edges from tx2 to m0.
      expect(witness0.siblingPath.pathSize).toBe(1 + 2);
      // The leaf is at index 0n in its tx subtree (height = 2), which has no tx subtrees on its left.
      expect(witness0.leafIndex).toBe(0n);

      // m2
      const m2 = txMessages2[2];
      const witness2 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m2);
      // 1 edges from root to tx2, 1 edge from tx2 to m2.
      expect(witness2.siblingPath.pathSize).toBe(1 + 1);
      // The leaf is at index 1n in its tx subtree (height = 1), which has no tx subtrees on its left.
      expect(witness2.leafIndex).toBe(1n);
    }

    {
      //           tx6
      //        /        \
      //       .          .
      //     /   \       / \
      //    .    .      .  m6
      //  /  \  /  \   / \
      // m0 m1 m2 m3  m4  m5

      // m3
      const m3 = txMessages6[3];
      const witness3 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m3);
      // 1 edge from root to tx6, 3 edges from tx6 to m3.
      expect(witness3.siblingPath.pathSize).toBe(1 + 3);
      // The leaf is at index 3n in its tx subtree (height = 3), which has 1 tx subtree on its left.
      expect(witness3.leafIndex).toBe(3n + 1n * (1n << 3n));

      // m4
      const m4 = txMessages6[4];
      const witness4 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m4);
      // 1 edge from root to tx6, 3 edges from tx6 to m4
      expect(witness4.siblingPath.pathSize).toBe(1 + 3);
      // The leaf is at index 4n in its tx subtree (height = 3), which has 1 tx subtree on its left.
      expect(witness4.leafIndex).toBe(4n + 1n * (1n << 3n));

      // m6
      const m6 = txMessages6[6];
      const witness6 = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, m6);
      // 1 edge from root to tx6, 2 edges from tx6 to m6
      expect(witness6.siblingPath.pathSize).toBe(1 + 2);
      // The leaf is at index 3n in its tx subtree (height = 2), which has 1 tx subtree on its left.
      expect(witness6.leafIndex).toBe(3n + 1n * (1n << 2n));
    }
  });
});
