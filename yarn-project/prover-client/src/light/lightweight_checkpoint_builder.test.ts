import { EMPTY_EPOCH_OUT_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { EthAddress } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import { accumulateCheckpointOutHashes, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import { mockProcessedTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { CheckpointGlobalVariables, ProcessedTx } from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { LightweightCheckpointBuilder } from './lightweight_checkpoint_builder.js';

describe('LightweightCheckpointBuilder', () => {
  let worldState: NativeWorldStateService;
  let feePayer: AztecAddress;
  let feePayerBalance: Fr;

  beforeEach(async () => {
    // Set up fee payer with balance
    feePayer = AztecAddress.fromNumberUnsafe(42222);
    feePayerBalance = new Fr(10n ** 20n);
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const genesis: GenesisData = {
      prefilledPublicData: [new PublicDataTreeLeaf(feePayerSlot, feePayerBalance)],
      genesisTimestamp: 0n,
    };

    // Create world state with fee payer balance
    worldState = await NativeWorldStateService.tmp(true, genesis);
  });

  afterEach(async () => {
    await worldState.close();
  });

  const makeCheckpointConstants = (slotNumber: SlotNumber): CheckpointGlobalVariables => {
    return {
      chainId: Fr.ZERO,
      version: Fr.ZERO,
      slotNumber,
      timestamp: BigInt(slotNumber) * 123n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    };
  };

  const makeGlobalVariables = (blockNumber: BlockNumber, slotNumber: SlotNumber): GlobalVariables => {
    return GlobalVariables.from({
      chainId: Fr.ZERO,
      version: Fr.ZERO,
      blockNumber,
      slotNumber,
      timestamp: BigInt(blockNumber) * 123n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });
  };

  const makeProcessedTx = async (globalVariables: GlobalVariables, seed: number): Promise<ProcessedTx> => {
    const tx = await mockProcessedTx({
      seed,
      globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContracts: ProtocolContractsList,
      feePayer,
    });

    // Update fee payer balance
    feePayerBalance = new Fr(feePayerBalance.toBigInt() - tx.txEffect.transactionFee.toBigInt());
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const feePaymentPublicDataWrite = new PublicDataWrite(feePayerSlot, feePayerBalance);
    tx.txEffect.publicDataWrites[0] = feePaymentPublicDataWrite;
    if (tx.avmProvingRequest) {
      tx.avmProvingRequest.inputs.publicInputs.accumulatedData.publicDataWrites[0] = feePaymentPublicDataWrite;
    }

    return tx;
  };

  describe('successful checkpoint building', () => {
    it('builds a checkpoint with a single empty block', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);
      const blockNumber = BlockNumber(1);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      // Use LightweightCheckpointBuilder directly
      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // Build empty block
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const { block } = await checkpointBuilder.applyEffectsAndSealBlock(globalVariables, [], []);

      expect(block.header.globalVariables.blockNumber).toEqual(blockNumber);

      // Complete checkpoint
      const checkpoint = await checkpointBuilder.completeCheckpoint();
      expect(checkpoint.number).toEqual(checkpointNumber);
      expect(checkpoint.blocks.length).toBe(1);
      expect(checkpoint.blocks[0].number).toEqual(blockNumber);

      // There is no previous checkpoints (previousCheckpointOutHashes == []), so the epoch out hash is empty.
      expect(checkpoint.header.epochOutHash).toEqual(new Fr(EMPTY_EPOCH_OUT_HASH));
      // The checkpoint's out hash is zero, since there are no txs/msgs.
      expect(checkpoint.getCheckpointOutHash()).toEqual(Fr.ZERO);

      await fork.close();
    });

    it('builds a checkpoint a single block with a single tx, with two checkpoints preceding it', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);
      const blockNumber = BlockNumber(1);

      const constants = makeCheckpointConstants(slotNumber);
      // There are two checkpoints before this one.
      const previousCheckpointOutHashes = [Fr.random(), Fr.random()];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // This checkpoint has a block with 1 tx.
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const tx = await makeProcessedTx(globalVariables, 1000);
      // Add some random l2-to-l1 messages to the tx.
      const msgs = [Fr.random(), Fr.random()];
      tx.txEffect.l2ToL1Msgs.push(...msgs);

      // Build block with tx
      const { block } = await checkpointBuilder.applyEffectsAndSealBlock(globalVariables, [tx], []);

      expect(block.header.globalVariables.blockNumber).toEqual(blockNumber);
      expect(block.body.txEffects.length).toBe(1);

      // Complete checkpoint
      const checkpoint = await checkpointBuilder.completeCheckpoint();
      expect(checkpoint.number).toEqual(checkpointNumber);
      expect(checkpoint.blocks.length).toBe(1);
      expect(checkpoint.blocks[0].number).toEqual(blockNumber);

      // The epoch out hash in the header is computed from the previous checkpoint out hashes and the current
      // checkpoint's out hash.
      const checkpointOutHash = checkpoint.getCheckpointOutHash();
      expect(checkpointOutHash).not.toEqual(Fr.ZERO);
      const epochOutHash = accumulateCheckpointOutHashes([...previousCheckpointOutHashes, checkpointOutHash]);
      expect(checkpoint.header.epochOutHash).toEqual(epochOutHash);

      await fork.close();
    });

    it('builds a checkpoint with a single block with a few txs', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);
      const blockNumber = BlockNumber(1);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // Create a few transactions
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const txs = await timesAsync(3, i => makeProcessedTx(globalVariables, 1000 + i));

      // Build block with txs
      const { block } = await checkpointBuilder.applyEffectsAndSealBlock(globalVariables, txs, []);

      expect(block.header.globalVariables.blockNumber).toEqual(blockNumber);
      expect(block.body.txEffects.length).toBe(3);

      // Complete checkpoint
      const checkpoint = await checkpointBuilder.completeCheckpoint();
      expect(checkpoint.number).toEqual(checkpointNumber);
      expect(checkpoint.blocks.length).toBe(1);
      expect(checkpoint.blocks[0].number).toEqual(blockNumber);

      await fork.close();
    });

    it('builds a checkpoint with multiple blocks with a few txs each', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // Build 3 blocks with 2 txs each
      const numBlocks = 3;
      const txsPerBlock = 2;

      for (let i = 0; i < numBlocks; i++) {
        const blockNumber = BlockNumber(i + 1);
        const globalVariables = makeGlobalVariables(blockNumber, slotNumber);

        // Create txs for this block
        const txs = await timesAsync(txsPerBlock, j => makeProcessedTx(globalVariables, 2000 + i * 10 + j));

        // Build block
        const { block } = await checkpointBuilder.applyEffectsAndSealBlock(globalVariables, txs, []);

        expect(block.header.globalVariables.blockNumber).toEqual(blockNumber);
        expect(block.body.txEffects.length).toBe(txsPerBlock);
      }

      // Complete checkpoint
      const checkpoint = await checkpointBuilder.completeCheckpoint();
      expect(checkpoint.number).toEqual(checkpointNumber);
      expect(checkpoint.blocks.length).toBe(numBlocks);

      // Verify all blocks are in the checkpoint
      for (let i = 0; i < numBlocks; i++) {
        expect(checkpoint.blocks[i].number).toEqual(BlockNumber(i + 1));
      }

      await fork.close();
    });

    it('builds a mid-checkpoint block with no txs that only carries messages', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      const globalVariables1 = makeGlobalVariables(BlockNumber(1), slotNumber);
      const txs1 = await timesAsync(2, i => makeProcessedTx(globalVariables1, 3000 + i));
      await checkpointBuilder.applyEffectsAndSealBlock(globalVariables1, txs1, []);

      const messages = [new Fr(0xb00), new Fr(0xb01)];
      const globalVariables2 = makeGlobalVariables(BlockNumber(2), slotNumber);
      const { block } = await checkpointBuilder.applyEffectsAndSealBlock(
        globalVariables2,
        [],
        [{ timestamp: 1000n, leaves: messages }],
      );

      expect(block.body.txEffects.length).toBe(0);
      expect(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex).toBe(messages.length);

      const checkpoint = await checkpointBuilder.completeCheckpoint();
      expect(checkpoint.blocks.length).toBe(2);
      expect(checkpoint.blocks[1].number).toEqual(BlockNumber(2));

      await fork.close();
    });

    it('sealBlock reuses leaves already in the fork and produces the same block as applyEffectsAndSealBlock', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);
      const constants = makeCheckpointConstants(slotNumber);
      const messages = [new Fr(0xb00), new Fr(0xb01), new Fr(0xb02)];
      const globalVariables = makeGlobalVariables(BlockNumber(1), slotNumber);

      // applyEffectsAndSealBlock appends the bundle itself.
      const fork1 = await worldState.fork();
      const builder1 = LightweightCheckpointBuilder.startNewCheckpoint(checkpointNumber, constants, [], Fr.ZERO, fork1);
      const bundle = [{ timestamp: 1000n, leaves: messages }];
      const { block: block1 } = await builder1.applyEffectsAndSealBlock(globalVariables, [], bundle);

      // sealBlock expects the caller to have appended the bundle already.
      const fork2 = await worldState.fork();
      const builder2 = LightweightCheckpointBuilder.startNewCheckpoint(checkpointNumber, constants, [], Fr.ZERO, fork2);
      await appendL1ToL2MessagesToTree(fork2, messages);
      const { block: block2 } = await builder2.sealBlock(globalVariables, [], bundle);

      expect(block2.header.equals(block1.header)).toBe(true);
      expect(block1.header.state.l1ToL2MessageTree.nextAvailableLeafIndex).toBe(messages.length);
      expect((await fork1.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE)).size).toBe(BigInt(messages.length));
      expect((await fork2.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE)).size).toBe(BigInt(messages.length));

      // The bundle is still accumulated into the checkpoint's message list when the append is skipped.
      const checkpoint1 = await builder1.completeCheckpoint();
      const checkpoint2 = await builder2.completeCheckpoint();
      expect(checkpoint2.header.inboxRollingHash).toEqual(checkpoint1.header.inboxRollingHash);
      expect(checkpoint1.header.inboxRollingHash).not.toEqual(Fr.ZERO);

      await fork1.close();
      await fork2.close();
    });
  });

  describe('error handling', () => {
    it('completing a checkpoint without blocks fails', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // Try to complete checkpoint without adding any blocks
      await expect(checkpointBuilder.completeCheckpoint()).rejects.toThrow(/no blocks/);

      await fork.close();
    });

    it('adding a block with a mismatched block number fails with archive tree leaf index mismatch', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        previousCheckpointOutHashes,
        Fr.ZERO,
        fork,
      );

      // Pass block number 5 when the archive tree expects block 1.
      // After updateArchive, nextAvailableLeafIndex will be 2 but expectedNextLeafIndex will be 6.
      const wrongBlockNumber = BlockNumber(5);
      const globalVariables = makeGlobalVariables(wrongBlockNumber, slotNumber);

      await expect(checkpointBuilder.applyEffectsAndSealBlock(globalVariables, [], [])).rejects.toThrow(
        /Archive tree next leaf index mismatch/,
      );

      await fork.close();
    });
  });
});
