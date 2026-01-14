import { EMPTY_EPOCH_OUT_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList, protocolContractsHash } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { EthAddress } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import { accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { mockProcessedTx } from '@aztec/stdlib/testing';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { ProcessedTx } from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

describe('CheckpointBuilder', () => {
  let worldState: NativeWorldStateService;
  let feePayer: AztecAddress;
  let feePayerBalance: Fr;

  beforeEach(async () => {
    // Set up fee payer with balance
    feePayer = AztecAddress.fromNumber(42222);
    feePayerBalance = new Fr(10n ** 20n);
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const prefilledPublicData = [new PublicDataTreeLeaf(feePayerSlot, feePayerBalance)];

    // Create world state with fee payer balance
    worldState = await NativeWorldStateService.tmp(undefined, true, prefilledPublicData);
  });

  afterEach(async () => {
    await worldState.close();
  });

  const makeCheckpointConstants = (slotNumber: SlotNumber): CheckpointConstantData => {
    return CheckpointConstantData.from({
      chainId: Fr.ZERO,
      version: Fr.ZERO,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
      proverId: Fr.ZERO,
      slotNumber,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });
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
      const l1ToL2Messages: Fr[] = [];
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      // Use LightweightCheckpointBuilder directly
      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
      );

      // Build empty block
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const block = await checkpointBuilder.addBlock(globalVariables, [], { insertTxsEffects: true });

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
      const l1ToL2Messages: Fr[] = [];
      // There are two checkpoints before this one.
      const previousCheckpointOutHashes = [Fr.random(), Fr.random()];

      const fork = await worldState.fork();

      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
      );

      // This checkpoint has a block with 1 tx.
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const tx = await makeProcessedTx(globalVariables, 1000);
      // Add some random l2-to-l1 messages to the tx.
      const msgs = [Fr.random(), Fr.random()];
      tx.txEffect.l2ToL1Msgs.push(...msgs);

      // Build block with tx - insertTxsEffects will handle inserting side effects
      const block = await checkpointBuilder.addBlock(globalVariables, [tx], {
        insertTxsEffects: true,
      });

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
      const l1ToL2Messages: Fr[] = [];
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
      );

      // Create a few transactions
      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const txs = await timesAsync(3, i => makeProcessedTx(globalVariables, 1000 + i));

      // Build block with txs - insertTxsEffects will handle inserting side effects
      const block = await checkpointBuilder.addBlock(globalVariables, txs, {
        insertTxsEffects: true,
      });

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
      const l1ToL2Messages: Fr[] = [];
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
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

        // Build block - insertTxsEffects will handle inserting side effects
        const block = await checkpointBuilder.addBlock(globalVariables, txs, {
          insertTxsEffects: true,
        });

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
  });

  describe('error handling', () => {
    it('completing a checkpoint without blocks fails', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const l1ToL2Messages: Fr[] = [];
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
      );

      // Try to complete checkpoint without adding any blocks
      await expect(checkpointBuilder.completeCheckpoint()).rejects.toThrow(/no blocks/);

      await fork.close();
    });

    it('adding an empty (no txs) block that is NOT the first block in the checkpoint fails', async () => {
      const checkpointNumber = CheckpointNumber(1);
      const slotNumber = SlotNumber(15);

      const constants = makeCheckpointConstants(slotNumber);
      const l1ToL2Messages: Fr[] = [];
      const previousCheckpointOutHashes: Fr[] = [];

      const fork = await worldState.fork();

      const checkpointBuilder = await LightweightCheckpointBuilder.startNewCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
      );

      // Add first block with txs - insertTxsEffects will handle inserting side effects
      const globalVariables1 = makeGlobalVariables(BlockNumber(1), slotNumber);
      const txs1 = await timesAsync(2, i => makeProcessedTx(globalVariables1, 3000 + i));
      await checkpointBuilder.addBlock(globalVariables1, txs1, {
        insertTxsEffects: true,
      });

      // Try to add second block with no txs - this should fail
      const globalVariables2 = makeGlobalVariables(BlockNumber(2), slotNumber);
      await expect(checkpointBuilder.addBlock(globalVariables2, [], { insertTxsEffects: true })).rejects.toThrow(
        /first block/,
      );

      await fork.close();
    });
  });
});
