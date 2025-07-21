import { SHA256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { MerkleTreeCalculator, SiblingPath, UnbalancedMerkleTreeCalculator } from '@aztec/foundation/trees';

export interface MessageRetrieval {
  getL2ToL1Messages(l2BlockNumber: number): Promise<Fr[][] | undefined>;
}

export type L2ToL1MembershipWitness = {
  l2MessageIndex: bigint;
  siblingPath: SiblingPath<number>;
};

export async function computeL2ToL1MembershipWitness(
  messageRetriever: MessageRetrieval,
  l2BlockNumber: number,
  message: Fr,
): Promise<L2ToL1MembershipWitness | undefined> {
  const messagesPerTx = await messageRetriever.getL2ToL1Messages(l2BlockNumber);
  if (!messagesPerTx) {
    return undefined;
  }

  // Find index of message in subtree and index of tx in a block
  let messageIndexInTx = -1,
    txIndex = -1;
  {
    txIndex = messagesPerTx.findIndex(messages => {
      const idx = messages.findIndex(msg => msg.equals(message));
      messageIndexInTx = Math.max(messageIndexInTx, idx);
      return idx !== -1;
    });
  }

  if (txIndex === -1) {
    throw new Error('The L2ToL1Message you are trying to prove inclusion of does not exist');
  }

  const hasher = new SHA256Trunc();

  // Get the message path in subtree and message subtree height
  let messagePathInSubtree: SiblingPath<number>;
  let messageSubtreeHeight: number;
  {
    const txMessages = messagesPerTx[txIndex];
    messageSubtreeHeight = txMessages.length <= 1 ? 1 : Math.ceil(Math.log2(txMessages.length));
    const calculator: MerkleTreeCalculator = await MerkleTreeCalculator.create(
      messageSubtreeHeight,
      Buffer.alloc(32, 0), // Zero leaf
      (lhs: Buffer, rhs: Buffer) => Promise.resolve(hasher.hash(lhs, rhs)),
    );

    const tree = await calculator.computeTree(txMessages.map(msg => msg.toBuffer()));
    const tempPath = tree.getSiblingPath(messageIndexInTx);
    messagePathInSubtree = new SiblingPath(tempPath.length, tempPath);
  }

  // If the number of txs is 1 we are dealing with a special case where the tx subtree itself is the whole block's
  // l2 to l1 message tree.
  const numTransactions = messagesPerTx.length;
  if (numTransactions === 1) {
    return {
      l2MessageIndex: BigInt(messageIndexInTx),
      siblingPath: messagePathInSubtree,
    };
  }

  // Calculate roots for all tx subtrees
  const txSubtreeRoots = await Promise.all(
    messagesPerTx.map(async (messages, _) => {
      // For a tx with no messages, we have to set an out hash of 0 to match what the circuit does.
      if (messages.length === 0) {
        return Fr.ZERO;
      }

      const txTreeHeight = messages.length <= 1 ? 1 : Math.ceil(Math.log2(messages.length));
      const calculator: MerkleTreeCalculator = await MerkleTreeCalculator.create(
        txTreeHeight,
        Buffer.alloc(32, 0), // Zero leaf
        (lhs: Buffer, rhs: Buffer) => Promise.resolve(hasher.hash(lhs, rhs)),
      );

      const root = await calculator.computeTreeRoot(messages.map(msg => msg.toBuffer()));
      return Fr.fromBuffer(root);
    }),
  );

  // Construct the top tree and compute the combined path
  let combinedPath: Buffer[];
  {
    const topTreeHeight = Math.ceil(Math.log2(txSubtreeRoots.length));
    // The root of this tree is the out_hash calculated in Noir => we truncate to match Noir's SHA
    const topTree = UnbalancedMerkleTreeCalculator.create(topTreeHeight, (lhs: Buffer, rhs: Buffer) =>
      Promise.resolve(hasher.hash(lhs, rhs)),
    );
    await topTree.appendLeaves(txSubtreeRoots.map(f => f.toBuffer()));

    const txPathInTopTree = await topTree.getSiblingPath(txSubtreeRoots[txIndex].toBigInt());
    // Append subtree path to top tree path
    combinedPath = messagePathInSubtree.toBufferArray().concat(txPathInTopTree.toBufferArray());
  }

  // Append binary index of subtree path to binary index of top tree path
  const combinedIndex = parseInt(
    txIndex.toString(2).concat(messageIndexInTx.toString(2).padStart(messageSubtreeHeight, '0')),
    2,
  );

  return {
    l2MessageIndex: BigInt(combinedIndex),
    siblingPath: new SiblingPath(combinedPath.length, combinedPath),
  };
}
