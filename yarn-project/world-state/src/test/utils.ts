import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { L2Block } from '@aztec/stdlib/block';
import type {
  IndexedTreeId,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';

import type { NativeWorldStateService } from '../native/native_world_state.js';

export async function mockBlock(
  blockNum: number,
  size: number,
  fork: MerkleTreeWriteOperations,
  maxEffects: number | undefined = undefined,
) {
  const l2Block = await L2Block.random(blockNum, size, maxEffects);
  const l1ToL2Messages = Array(16).fill(0).map(Fr.random);

  {
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
      l2Block.body.txEffects.map(txEffect => txEffect.publicDataWrites.map(write => write.toBuffer())),
      0,
      fork,
    );
    const nullifierInsert = insertData(
      MerkleTreeId.NULLIFIER_TREE,
      l2Block.body.txEffects.map(txEffect =>
        padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(nullifier => nullifier.toBuffer()),
      ),
      NULLIFIER_SUBTREE_HEIGHT,
      fork,
    );
    const noteHashesPadded = l2Block.body.txEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );

    const l1ToL2MessagesPadded = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    const noteHashInsert = fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);
    const messageInsert = fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    await Promise.all([publicDataInsert, nullifierInsert, noteHashInsert, messageInsert]);
  }

  const state = await fork.getStateReference();
  l2Block.header.state = state;
  await fork.updateArchive(l2Block.header);

  const archiveState = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

  l2Block.archive = new AppendOnlyTreeSnapshot(Fr.fromBuffer(archiveState.root), Number(archiveState.size));

  return {
    block: l2Block,
    messages: l1ToL2Messages,
  };
}

export async function mockEmptyBlock(blockNum: number, fork: MerkleTreeWriteOperations) {
  const l2Block = L2Block.empty();
  const l1ToL2Messages = Array(16).fill(0).map(Fr.zero);

  l2Block.header.globalVariables.blockNumber = blockNum;

  // Sync the append only trees
  {
    const noteHashesPadded = l2Block.body.txEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    await fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);

    const l1ToL2MessagesPadded = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    await fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
  }

  // Sync the indexed trees
  {
    // We insert the public data tree leaves with one batch per tx to avoid updating the same key twice
    for (const txEffect of l2Block.body.txEffects) {
      await fork.batchInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        txEffect.publicDataWrites.map(write => write.toBuffer()),
        0,
      );

      const nullifiersPadded = padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX);

      await fork.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        nullifiersPadded.map(nullifier => nullifier.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );
    }
  }

  const state = await fork.getStateReference();
  l2Block.header.state = state;
  await fork.updateArchive(l2Block.header);

  const archiveState = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

  l2Block.archive = new AppendOnlyTreeSnapshot(Fr.fromBuffer(archiveState.root), Number(archiveState.size));

  return {
    block: l2Block,
    messages: l1ToL2Messages,
  };
}

export async function mockBlocks(from: number, count: number, numTxs: number, worldState: NativeWorldStateService) {
  const tempFork = await worldState.fork(from - 1);

  const blocks = [];
  const messagesArray = [];
  for (let blockNumber = from; blockNumber < from + count; blockNumber++) {
    const { block, messages } = await mockBlock(blockNumber, numTxs, tempFork);
    blocks.push(block);
    messagesArray.push(messages);
  }

  await tempFork.close();

  return { blocks, messages: messagesArray };
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
