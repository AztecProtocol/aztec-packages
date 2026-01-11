import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { bufferAlloc } from '@aztec/foundation/buffer';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeCompressedUnbalancedShaRoot, computeUnbalancedShaRoot } from '@aztec/foundation/trees';

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

export function computeEpochOutHash(messagesInEpoch: Fr[][][][]): Fr {
  // Must match the implementation in `compute_epoch_out_hash.nr`.
  const checkpointOutHashes = messagesInEpoch
    .map(checkpoint => computeCheckpointOutHash(checkpoint))
    .map(hash => hash.toBuffer());
  if (checkpointOutHashes.every(hash => hash.equals(bufferAlloc(32)))) {
    return Fr.ZERO;
  }

  const paddedOutHashes = padArrayEnd(checkpointOutHashes, bufferAlloc(32), AZTEC_MAX_EPOCH_DURATION);
  return Fr.fromBuffer(computeUnbalancedShaRoot(paddedOutHashes));
}

// The root of this tree should match the `out_hash` calculated in the circuits. Zero hashes are compressed to reduce
// cost if the non-zero leaves result in a shorter path.
function aggregateOutHashes(outHashes: Fr[]): Fr {
  if (!outHashes.length) {
    return Fr.ZERO;
  }

  return Fr.fromBuffer(computeCompressedUnbalancedShaRoot(outHashes.map(hash => hash.toBuffer())));
}
