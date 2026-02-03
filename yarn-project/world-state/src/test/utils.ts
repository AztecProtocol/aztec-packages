import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, type CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { L2Block } from '@aztec/stdlib/block';
import type {
  IndexedTreeId,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import { mockCheckpointAndMessages, mockL1ToL2Messages } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { NativeWorldStateService } from '../native/native_world_state.js';

export async function updateBlockState(block: L2Block, l1ToL2Messages: Fr[], fork: MerkleTreeWriteOperations) {
  const insertData = async (
    treeId: IndexedTreeId,
    data: Buffer[][],
    subTreeHeight: number,
    fork: MerkleTreeWriteOperations,
  ) => {
    for (const dataBatch of data) {
      await fork.batchInsert(treeId, dataBatch, subTreeHeight);
    }
  };

  const publicDataInsert = insertData(
    MerkleTreeId.PUBLIC_DATA_TREE,
    block.body.txEffects.map(txEffect => txEffect.publicDataWrites.map(write => write.toBuffer())),
    0,
    fork,
  );
  const nullifierInsert = insertData(
    MerkleTreeId.NULLIFIER_TREE,
    block.body.txEffects.map(txEffect =>
      padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(nullifier => nullifier.toBuffer()),
    ),
    NULLIFIER_SUBTREE_HEIGHT,
    fork,
  );
  const noteHashesPadded = block.body.txEffects.flatMap(txEffect =>
    padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
  );

  const l1ToL2MessagesPadded =
    block.indexWithinCheckpoint === 0
      ? padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP)
      : l1ToL2Messages;

  const noteHashInsert = fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);
  const messageInsert = fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
  await Promise.all([publicDataInsert, nullifierInsert, noteHashInsert, messageInsert]);

  const state = await fork.getStateReference();
  block.header = BlockHeader.from({ ...block.header, state });
  await fork.updateArchive(block.header);

  const archiveState = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

  block.archive = new AppendOnlyTreeSnapshot(Fr.fromBuffer(archiveState.root), Number(archiveState.size));
}

export async function mockBlock(
  blockNum: BlockNumber,
  size: number,
  fork: MerkleTreeWriteOperations,
  maxEffects: number | undefined = 1000, // Defaults to the maximum tx effects.
  numL1ToL2Messages: number = NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  isFirstBlockInCheckpoint: boolean = true,
) {
  const block = await L2Block.random(blockNum, {
    indexWithinCheckpoint: isFirstBlockInCheckpoint ? IndexWithinCheckpoint(0) : IndexWithinCheckpoint(1),
    txsPerBlock: size,
    txOptions: { maxEffects },
  });
  const l1ToL2Messages = mockL1ToL2Messages(numL1ToL2Messages);

  await updateBlockState(block, l1ToL2Messages, fork);

  return {
    block,
    messages: l1ToL2Messages,
  };
}

export async function mockEmptyBlock(blockNum: BlockNumber, fork: MerkleTreeWriteOperations) {
  const l2Block = L2Block.empty();
  const l1ToL2Messages = Array(16).fill(0).map(Fr.zero);

  l2Block.header.globalVariables.blockNumber = blockNum;

  await updateBlockState(l2Block, l1ToL2Messages, fork);

  return {
    block: l2Block,
    messages: l1ToL2Messages,
  };
}

export async function mockBlocks(
  from: BlockNumber,
  count: number,
  numTxs: number,
  worldState: NativeWorldStateService,
) {
  const tempFork = await worldState.fork(BlockNumber(from - 1));

  const blocks = [];
  const messagesArray = [];
  for (let blockNumber = from; blockNumber < from + count; blockNumber++) {
    const { block, messages } = await mockBlock(BlockNumber(blockNumber), numTxs, tempFork);
    blocks.push(block);
    messagesArray.push(messages);
  }

  await tempFork.close();

  return { blocks, messages: messagesArray };
}

export async function mockCheckpoint(
  checkpointNumber: CheckpointNumber,
  fork: MerkleTreeWriteOperations,
  options: Partial<Parameters<typeof mockCheckpointAndMessages>[1]> = {},
) {
  const { checkpoint, messages } = await mockCheckpointAndMessages(checkpointNumber, options);
  await asyncMap(checkpoint.blocks, async (block, i) => {
    await updateBlockState(block, i === 0 ? messages : [], fork);
  });
  return { checkpoint, messages };
}

export async function assertSameState(forkA: MerkleTreeReadOperations, forkB: MerkleTreeReadOperations) {
  const nativeStateRef = await forkA.getStateReference();
  const nativeArchive = await forkA.getTreeInfo(MerkleTreeId.ARCHIVE);
  const legacyStateRef = await forkB.getStateReference();
  const legacyArchive = await forkB.getTreeInfo(MerkleTreeId.ARCHIVE);

  expect(nativeStateRef).toEqual(legacyStateRef);
  expect(nativeArchive).toEqual(legacyArchive);
}

export async function compareChains(left: MerkleTreeReadOperations, right: MerkleTreeReadOperations) {
  for (const treeId of [
    MerkleTreeId.ARCHIVE,
    MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
    MerkleTreeId.NOTE_HASH_TREE,
    MerkleTreeId.NULLIFIER_TREE,
    MerkleTreeId.PUBLIC_DATA_TREE,
  ]) {
    expect(await left.getTreeInfo(treeId)).toEqual(await right.getTreeInfo(treeId));

    expect(await left.getSiblingPath(treeId, 0n)).toEqual(await right.getSiblingPath(treeId, 0n));
  }
}
