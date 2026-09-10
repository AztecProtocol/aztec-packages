import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeRootFromSiblingPath } from '@aztec/foundation/trees';
import { type BlockData, BlockHash } from '@aztec/stdlib/block';
import { computeMerkleHash } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, PartialStateReference, StateReference } from '@aztec/stdlib/tx';

import { findMessageInsertionBlock, verifyL1ToL2MessageWitness } from './inbox_message_checks.js';

/** Height the node serves L1→L2 witnesses at. Kept here so the fixtures build paths of the right length. */
const MESSAGE_TREE_HEIGHT = 36;

function buildBlockData(blockNumber: number, leaves: number, root = Fr.ZERO): BlockData {
  return {
    header: BlockHeader.empty({
      globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(blockNumber) }),
      state: new StateReference(new AppendOnlyTreeSnapshot(root, leaves), PartialStateReference.empty()),
    }),
    archive: AppendOnlyTreeSnapshot.empty(),
    blockHash: BlockHash.random(),
    checkpointNumber: CheckpointNumber(1),
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
  };
}

/** Node view over a chain where block `n` has consumed `leavesAt(n)` L1→L2 messages. */
function nodeWithLeaves(leavesAt: (blockNumber: number) => number | undefined): Pick<AztecNode, 'getBlockData'> {
  return {
    getBlockData: param => {
      const blockNumber = typeof param === 'object' && param !== null && 'number' in param ? param.number : undefined;
      if (blockNumber === undefined) {
        return Promise.resolve(undefined);
      }
      const leaves = leavesAt(blockNumber);
      return Promise.resolve(leaves === undefined ? undefined : buildBlockData(blockNumber, leaves));
    },
  };
}

describe('verifyL1ToL2MessageWitness', () => {
  const msgHash = new Fr(42n);
  const siblingPath = Array.from({ length: MESSAGE_TREE_HEIGHT }, (_, i) => new Fr(BigInt(i + 1)).toBuffer());

  const rootFor = async (index: number) =>
    Fr.fromBuffer(
      await computeRootFromSiblingPath(msgHash.toBuffer(), siblingPath, index, async (left, right) =>
        (await computeMerkleHash(Fr.fromBuffer(left), Fr.fromBuffer(right))).toBuffer(),
      ),
    );

  it('accepts a witness that hashes up to the block root', async () => {
    const verdict = await verifyL1ToL2MessageWitness({
      msgHash,
      witnessIndex: 7n,
      siblingPath,
      expectedIndex: 7n,
      expectedRoot: await rootFor(7),
    });

    expect(verdict).toEqual('valid');
  });

  it('rejects a witness for a different leaf index than the one L1 assigned', async () => {
    const verdict = await verifyL1ToL2MessageWitness({
      msgHash,
      witnessIndex: 8n,
      siblingPath,
      expectedIndex: 7n,
      expectedRoot: await rootFor(8),
    });

    expect(verdict).toEqual('wrong_index');
  });

  it('rejects a witness that does not reconstruct the block root', async () => {
    const verdict = await verifyL1ToL2MessageWitness({
      msgHash,
      witnessIndex: 7n,
      siblingPath,
      expectedIndex: 7n,
      expectedRoot: Fr.random(),
    });

    expect(verdict).toEqual('wrong_root');
  });

  it('refuses to answer for an index it cannot hash up with, rather than answering wrongly', async () => {
    const verdict = await verifyL1ToL2MessageWitness({
      msgHash,
      witnessIndex: 2n ** 31n,
      siblingPath,
      expectedIndex: 2n ** 31n,
      expectedRoot: Fr.random(),
    });

    expect(verdict).toEqual('unverifiable');
  });
});

describe('findMessageInsertionBlock', () => {
  // Blocks 1-9 consume ten messages each, so block n covers indices below n * 10.
  const tenPerBlock = nodeWithLeaves(blockNumber => (blockNumber <= 9 ? blockNumber * 10 : undefined));

  it('finds the block that first covered the message', async () => {
    expect(await findMessageInsertionBlock(tenPerBlock, 45n, BlockNumber(9), 128)).toEqual(5);
    expect(await findMessageInsertionBlock(tenPerBlock, 0n, BlockNumber(9), 128)).toEqual(1);
    expect(await findMessageInsertionBlock(tenPerBlock, 89n, BlockNumber(9), 128)).toEqual(9);
  });

  it('is inconclusive when the upper bound does not cover the message', async () => {
    expect(await findMessageInsertionBlock(tenPerBlock, 95n, BlockNumber(9), 128)).toBeUndefined();
  });

  it('is inconclusive when the message was already covered before the search window', async () => {
    expect(await findMessageInsertionBlock(tenPerBlock, 5n, BlockNumber(9), 3)).toBeUndefined();
  });

  it('is inconclusive when a block in the range cannot be read', async () => {
    const gappy = nodeWithLeaves(blockNumber => (blockNumber === 4 ? undefined : blockNumber * 10));

    expect(await findMessageInsertionBlock(gappy, 45n, BlockNumber(9), 128)).toBeUndefined();
  });
});
