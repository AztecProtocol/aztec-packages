import { Fr } from '@aztec/foundation/fields';
import {
  SiblingPath,
  UnbalancedMerkleTreeCalculator,
  computeUnbalancedMerkleTreeRoot,
  findLeafLevelAndIndex,
  getMaxUnbalancedTreeDepth,
} from '@aztec/foundation/trees';

async function createOutHashTree(messages: Fr[]) {
  const messageSubtreeHeight = getMaxUnbalancedTreeDepth(messages.length);
  const calculator = UnbalancedMerkleTreeCalculator.create(messageSubtreeHeight);
  await calculator.appendLeaves(messages.map(msg => msg.toBuffer()));
  return calculator;
}

export interface MessageRetrieval {
  getL2ToL1Messages(l2BlockNumber: number): Promise<Fr[][] | undefined>;
}

export type L2ToL1MembershipWitness = {
  root: Fr;
  leafIndex: bigint;
  siblingPath: SiblingPath<number>;
};

export async function computeL2ToL1MembershipWitness(
  messageRetriever: MessageRetrieval,
  l2BlockNumber: number,
  message: Fr,
): Promise<L2ToL1MembershipWitness | undefined> {
  const messagesForAllTxs = await messageRetriever.getL2ToL1Messages(l2BlockNumber);
  if (!messagesForAllTxs) {
    return undefined;
  }

  return computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, message);
}

export async function computeL2ToL1MembershipWitnessFromMessagesForAllTxs(
  messagesForAllTxs: Fr[][],
  message: Fr,
): Promise<L2ToL1MembershipWitness> {
  // Find index of message in subtree and index of tx in a block.
  let messageIndexInTx = -1;
  const txIndex = messagesForAllTxs.findIndex(messages => {
    messageIndexInTx = messages.findIndex(msg => msg.equals(message));
    return messageIndexInTx !== -1;
  });

  if (txIndex === -1) {
    throw new Error('The L2ToL1Message you are trying to prove inclusion of does not exist');
  }

  // Get the txOutHash and the sibling path of the message in the tx subtree.
  const txMessages = messagesForAllTxs[txIndex];
  const txOutHashTree = await createOutHashTree(txMessages);
  const txOutHash = txOutHashTree.getRoot();
  const messagePathInSubtree = await txOutHashTree.getSiblingPath(message);

  // Calculate txOutHash for all txs.
  const txSubtreeRoots = messagesForAllTxs.map((messages, i) => {
    // For a tx with no messages, we have to set an out hash of 0 to match what the circuit does.
    if (messages.length === 0) {
      return Fr.ZERO;
    }

    if (i === txIndex) {
      return Fr.fromBuffer(txOutHash);
    }

    const root = computeUnbalancedMerkleTreeRoot(messages.map(msg => msg.toBuffer()));
    return Fr.fromBuffer(root);
  });

  // Construct the top tree.
  // The leaves of this tree are the txOutHashes.
  // The root of this tree is the out_hash calculated in the circuit.
  const topTree = await createOutHashTree(txSubtreeRoots);
  const root = Fr.fromBuffer(topTree.getRoot());

  // Compute the combined sibling path by appending the tx subtree path to the top tree path.
  const txPathInTopTree = await topTree.getSiblingPath(txOutHash);
  const combinedPath = messagePathInSubtree.toBufferArray().concat(txPathInTopTree.toBufferArray());

  // Compute the combined index.
  // It is the index of the message in the balanced tree at its current height.
  const txLeafPosition = findLeafLevelAndIndex(messagesForAllTxs.length, txIndex);
  const messageLeafPosition = findLeafLevelAndIndex(txMessages.length, messageIndexInTx);
  const numLeavesInLeftSubtrees = txLeafPosition.indexAtLevel * (1 << messageLeafPosition.level);
  const combinedIndex = numLeavesInLeftSubtrees + messageLeafPosition.indexAtLevel;

  return {
    root,
    leafIndex: BigInt(combinedIndex),
    siblingPath: new SiblingPath(combinedPath.length, combinedPath),
  };
}

export function getL2ToL1MessageLeafId(
  membershipWitness: Pick<L2ToL1MembershipWitness, 'leafIndex' | 'siblingPath'>,
): bigint {
  return 2n ** BigInt(membershipWitness.siblingPath.pathSize) + membershipWitness.leafIndex;
}
