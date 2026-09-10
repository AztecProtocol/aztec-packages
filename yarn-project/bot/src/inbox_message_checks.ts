import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeRootFromSiblingPath } from '@aztec/foundation/trees';
import { computeMerkleHash } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * The node surface a readiness check needs. `isL1ToL2MessageReady` from `aztec.js` is written against exactly this
 * pair, so an object satisfying it can pin the check to one block without changing the SDK.
 */
export type ReadinessNode = Pick<AztecNode, 'getBlockData' | 'getL1ToL2MessageIndex'>;

/**
 * Returns a node view whose `getBlockData` always answers for one concrete block, whatever block parameter the
 * caller passes. Readiness compares a message's index against the tip's message-tree size through two separate
 * reads; pinning the block half of that pair makes the answer reproducible instead of racing the chain tip.
 */
export function pinReadinessNodeToBlock(node: ReadinessNode, blockNumber: BlockNumber): ReadinessNode {
  return {
    getBlockData: () => node.getBlockData({ number: blockNumber }),
    getL1ToL2MessageIndex: (l1ToL2Message: Fr) => node.getL1ToL2MessageIndex(l1ToL2Message),
  };
}

/** Verdict of checking a membership witness against the block header it was fetched at. */
export const MessageWitnessVerdicts = ['valid', 'wrong_index', 'wrong_root', 'unverifiable'] as const;
export type MessageWitnessVerdict = (typeof MessageWitnessVerdicts)[number];

/**
 * Recomputes the L1→L2 message tree root from a membership witness and compares it against the root the block
 * header carries, which is what makes a positive readiness answer more than the node's word for it.
 *
 * `unverifiable` is returned instead of a verdict when the leaf index is too large to hash up with, rather than
 * risking a wrong answer: {@link computeRootFromSiblingPath} walks the path with a 32-bit shift, so an index at or
 * above 2^31 would silently take the wrong branch. Reaching that many Inbox messages is not realistic, and a
 * check that cannot be trusted must count as neither a pass nor a failure.
 */
export async function verifyL1ToL2MessageWitness(args: {
  msgHash: Fr;
  /** Leaf index the node's witness reported. */
  witnessIndex: bigint;
  siblingPath: Buffer[];
  /** Index the Inbox event assigned the message on L1. */
  expectedIndex: bigint;
  /** L1→L2 message tree root of the block the witness was fetched at. */
  expectedRoot: Fr;
}): Promise<MessageWitnessVerdict> {
  const { witnessIndex } = args;
  if (witnessIndex !== args.expectedIndex) {
    return 'wrong_index';
  }
  if (witnessIndex >= 2n ** 31n) {
    return 'unverifiable';
  }
  const root = await computeRootFromSiblingPath(
    args.msgHash.toBuffer(),
    args.siblingPath,
    Number(witnessIndex),
    async (left, right) => (await computeMerkleHash(Fr.fromBuffer(left), Fr.fromBuffer(right))).toBuffer(),
  );
  return root.equals(args.expectedRoot.toBuffer()) ? 'valid' : 'wrong_root';
}

/**
 * Finds the first block whose L1→L2 message tree covers `leafIndex`, searching back at most `maxLookback` blocks
 * from `upperBound`. Blocks consume Inbox messages in order into consecutive leaves, so "the tree has grown past
 * this index" is monotonic along a canonical chain and can be bisected.
 *
 * Returns undefined when the search is inconclusive: the upper bound does not cover the message, the message was
 * already covered before the window opened, or a block could not be read. The caller reports that as an unknown
 * relation rather than guessing at one.
 */
export async function findMessageInsertionBlock(
  node: Pick<AztecNode, 'getBlockData'>,
  leafIndex: bigint,
  upperBound: BlockNumber,
  maxLookback: number,
): Promise<BlockNumber | undefined> {
  const covers = async (blockNumber: number): Promise<boolean | undefined> => {
    const block = await node.getBlockData({ number: BlockNumber(blockNumber) });
    return block === undefined
      ? undefined
      : BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex) > leafIndex;
  };

  if ((await covers(upperBound)) !== true) {
    return undefined;
  }

  let low = Math.max(1, upperBound - maxLookback);
  if (low > 1 && (await covers(low - 1)) !== false) {
    return undefined;
  }

  let high: number = upperBound;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const covered = await covers(middle);
    if (covered === undefined) {
      return undefined;
    }
    if (covered) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return BlockNumber(low);
}
