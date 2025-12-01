import { Fr } from '@aztec/foundation/fields';
import { UnbalancedMerkleTreeCalculator, computeUnbalancedShaRoot } from '@aztec/foundation/trees';

export function computeTxOutHash(messages: Fr[]): Fr {
  if (!messages.length) {
    return Fr.ZERO;
  }
  // Tx out hash is the root of the unbalanced merkle tree of all the messages.
  // Zero hashes (which should not happen) are not compressed.
  return Fr.fromBuffer(computeUnbalancedShaRoot(messages.map(msg => msg.toBuffer())));
}

export function computeBlockOutHash(messagesPerBlock: Fr[][]): Fr {
  const txOutHashes = messagesPerBlock.map(messages => computeTxOutHash(messages));
  return aggregateOutHashes(txOutHashes);
}

export function computeCheckpointOutHash(messagesForAllTxs: Fr[][][]): Fr {
  const blockOutHashes = messagesForAllTxs.map(block => computeBlockOutHash(block));
  return aggregateOutHashes(blockOutHashes);
}

// The root of this tree should match the `out_hash` calculated in the circuits. Zero hashes are compressed to reduce
// cost if the non-zero leaves result in a shorter path.
function aggregateOutHashes(outHashes: Fr[]): Fr {
  if (!outHashes.length) {
    return Fr.ZERO;
  }

  const valueToCompress = Buffer.alloc(32);
  const tree = UnbalancedMerkleTreeCalculator.create(
    outHashes.map(hash => hash.toBuffer()),
    valueToCompress,
  );
  return Fr.fromBuffer(tree.getRoot());
}
