import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { BlockNumber, type CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields/bn254';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type {
  IndexedTreeId,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';

import type { NativeWorldStateService } from '../native/native_world_state.js';

export async function mockBlock(
  blockNum: BlockNumber,
  size: number,
  fork: MerkleTreeWriteOperations,
  maxEffects: number | undefined = 1000, // Defaults to the maximum tx effects.
  numL1ToL2Messages: number = NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  isFirstBlock: boolean = true,
) {
  const l2Block = await L2BlockNew.random(blockNum, { txsPerBlock: size, txOptions: { maxEffects } });
  const l1ToL2Messages = mockL1ToL2Messages(numL1ToL2Messages);

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

    const l1ToL2MessagesPadded = isFirstBlock
      ? padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP)
      : l1ToL2Messages;

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

export async function mockEmptyBlock(blockNum: BlockNumber, fork: MerkleTreeWriteOperations) {
  const l2Block = L2BlockNew.empty();
  const l1ToL2Messages = Array(16).fill(0).map(Fr.zero);

  l2Block.header.globalVariables.blockNumber = blockNum;

  // Sync the append only trees
  {
    const noteHashesPadded = l2Block.body.txEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    await fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);

    const l1ToL2MessagesPadded = padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
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

export function mockL1ToL2Messages(numL1ToL2Messages: number) {
  return Array(numL1ToL2Messages).fill(0).map(Fr.random);
}

export async function mockCheckpoint(
  checkpointNumber: CheckpointNumber,
  {
    startBlockNumber = BlockNumber(1),
    numBlocks = 1,
    numTxsPerBlock = 1,
    numL1ToL2Messages = 1,
    fork,
  }: {
    startBlockNumber?: BlockNumber;
    numBlocks?: number;
    numTxsPerBlock?: number;
    numL1ToL2Messages?: number;
    fork?: MerkleTreeWriteOperations;
  } = {},
) {
  const slotNumber = SlotNumber(checkpointNumber * 10);
  const blocksAndMessages = [];
  for (let i = 0; i < numBlocks; i++) {
    const blockNumber = BlockNumber(startBlockNumber + i);
    const { block, messages } = fork
      ? await mockBlock(blockNumber, numTxsPerBlock, fork, blockNumber === startBlockNumber ? numL1ToL2Messages : 0)
      : {
          block: await L2BlockNew.random(blockNumber, { txsPerBlock: numTxsPerBlock, slotNumber }),
          messages: mockL1ToL2Messages(numL1ToL2Messages),
        };
    blocksAndMessages.push({ block, messages });
  }

  const messages = blocksAndMessages[0].messages;
  const inHash = computeInHashFromL1ToL2Messages(messages);
  const checkpoint = await Checkpoint.random(checkpointNumber, { numBlocks: 0, slotNumber, inHash });
  checkpoint.blocks = blocksAndMessages.map(({ block }) => block);

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
