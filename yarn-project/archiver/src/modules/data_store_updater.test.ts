import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import { ContractClassLog, PrivateLog, Tag } from '@aztec/stdlib/logs';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import '@aztec/stdlib/testing/jest';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { type ArchiverDataStores, createArchiverDataStores } from '../store/data_stores.js';
import { L2TipsCache } from '../store/l2_tips_cache.js';
import { makeCheckpoint, makePublishedCheckpoint } from '../test/mock_structs.js';
import { ArchiverDataStoreUpdater } from './data_store_updater.js';

/** Loads the sample ContractClassPublished event payload from protocol-contracts fixtures. */
function getSampleContractClassPublishedEventPayload(): Buffer {
  const fixturePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../protocol-contracts/fixtures/ContractClassPublishedEventData.hex',
  );
  return Buffer.from(readFileSync(fixturePath).toString(), 'hex');
}

/** Loads the sample ContractInstancePublished event payload from protocol-contracts fixtures. */
function getSampleContractInstancePublishedEventPayload(): Buffer {
  const fixturePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../protocol-contracts/fixtures/ContractInstancePublishedEventData.hex',
  );
  return Buffer.from(readFileSync(fixturePath).toString(), 'hex');
}

describe('ArchiverDataStoreUpdater', () => {
  let store: ArchiverDataStores;
  let updater: ArchiverDataStoreUpdater;
  let contractClassLog: ContractClassLog;
  let contractClassId: Fr;
  let instanceAddress: AztecAddress;

  beforeEach(async () => {
    store = createArchiverDataStores(await openTmpStore('data_store_updater_test'), { logsMaxPageSize: 1000 });
    updater = new ArchiverDataStoreUpdater(store);

    // Create contract class log from sample fixture data
    contractClassLog = ContractClassLog.fromBuffer(getSampleContractClassPublishedEventPayload());
    const classEvent = ContractClassPublishedEvent.fromLog(contractClassLog);
    contractClassId = classEvent.contractClassId;

    // Create contract instance log from sample fixture data
    const instanceLog = PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload());
    const instanceEvent = ContractInstancePublishedEvent.fromLog(instanceLog);
    instanceAddress = instanceEvent.address;
  });

  describe('contract data', () => {
    it('stores contract class and instance data when blocks are added via addProposedBlock', async () => {
      // Create block with contract class and instance logs
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      await updater.addProposedBlock(block);

      // Verify contract class was stored
      const retrievedClass = await store.contractClasses.getContractClass(contractClassId);
      expect(retrievedClass).toBeDefined();
      expect(retrievedClass?.id.equals(contractClassId)).toBe(true);

      // Verify contract instance was stored (use a timestamp after block creation)
      const timestamp = block.header.globalVariables.timestamp + 1n;
      const retrievedInstance = await store.contractInstances.getContractInstance(instanceAddress, timestamp);
      expect(retrievedInstance).toBeDefined();
      expect(retrievedInstance?.address.equals(instanceAddress)).toBe(true);
    });

    it('removes contract class and instance data when blocks are pruned via setCheckpointData', async () => {
      // First, add a local provisional block with contract data
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      localBlock.body.txEffects[0].contractClassLogs = [contractClassLog];
      localBlock.body.txEffects[0].privateLogs = [
        PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload()),
      ];

      await updater.addProposedBlock(localBlock);

      // Verify contract data was stored
      const timestamp = localBlock.header.globalVariables.timestamp + 1n;
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Now create a checkpoint with a conflicting block (same slot but different archive root)
      const conflictingBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100), // Same slot as local block
      });
      // Make sure it has a different archive root (which it will by default from random)
      expect(conflictingBlock.archive.root.equals(localBlock.archive.root)).toBe(false);

      const checkpointWithConflict = makeCheckpoint([conflictingBlock]);
      const publishedCheckpoint = makePublishedCheckpoint(checkpointWithConflict, 10);

      // This should detect the conflict and prune the local block
      await updater.addCheckpoints([publishedCheckpoint]);

      // Verify the contract data from the local block was removed
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
    });

    it('reconciles a local proposed block with an L1 checkpoint at the same block number but different slot', async () => {
      // Regression for issue fixed at https://github.com/AztecProtocol/aztec-packages/pull/23461
      // Local proposed block 1 at slot 125, containing a deployed contract instance.
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(125),
      });
      localBlock.body.txEffects[0].contractClassLogs = [contractClassLog];
      localBlock.body.txEffects[0].privateLogs = [
        PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload()),
      ];
      await updater.addProposedBlock(localBlock);

      const timestamp = localBlock.header.globalVariables.timestamp + 1n;
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // L1 confirmed a different block 1 at slot 124, containing the SAME deployed contract instance
      // (the same user tx ended up on chain, just signed by a different proposer at a different slot).
      // Without the fix the prune step misses the conflict because the slot does not match, and
      // re-applying the L1 block's contract data throws "Contract instance ... already exists".
      const l1Block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(124),
      });
      l1Block.body.txEffects[0].contractClassLogs = [contractClassLog];
      l1Block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];
      expect(l1Block.archive.root.equals(localBlock.archive.root)).toBe(false);

      const published = makePublishedCheckpoint(makeCheckpoint([l1Block]), 10);

      await expect(updater.addCheckpoints([published])).resolves.not.toThrow();

      // The L1 block must end up persisted, with its contract instance reachable.
      const storedBlock = await store.blocks.getBlock({ number: BlockNumber(1) });
      expect(storedBlock?.archive.root.equals(l1Block.archive.root)).toBe(true);
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();
    });

    it('evicts higher-numbered proposed checkpoints that chain off pruned blocks on conflict', async () => {
      // Local builds: block 1 (slot 125, checkpoint 1) → proposed checkpoint 1
      //               block 2 (slot 126, checkpoint 2) → proposed checkpoint 2
      // block_store.addCheckpoints already deletes the proposed entry at the same number it stores,
      // so the eviction code matters specifically for higher-numbered proposed checkpoints whose
      // referenced blocks were pruned by the conflict.
      const localBlock1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(125),
      });
      await updater.addProposedBlock(localBlock1);
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });

      const localBlock2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(126),
        lastArchive: localBlock1.archive,
      });
      await updater.addProposedBlock(localBlock2);
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });

      expect(await store.blocks.getProposedCheckpointNumber()).toBe(2);

      // L1 publishes a conflicting block 1. Pruning takes out both local blocks; both proposed
      // checkpoints must be evicted (proposed 1 by block_store.addCheckpoints, proposed 2 by us).
      const l1Block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(124),
      });
      expect(l1Block.archive.root.equals(localBlock1.archive.root)).toBe(false);

      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([l1Block]), 10)]);

      expect(await store.blocks.getLastProposedCheckpoint()).toBeUndefined();
    });

    it('preserves a speculative local block at a later slot when L1 confirms the matching previous block', async () => {
      // Local proposes block 1 at slot 100 and a speculative block 2 at slot 101 built atop it.
      // Pipelining: block 2 is the start of proposed checkpoint 2 and must not be pruned just
      // because L1 confirmed a checkpoint that only contains block 1.
      const localBlock1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock1);

      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });

      const localBlock2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(101),
        lastArchive: localBlock1.archive,
      });
      await updater.addProposedBlock(localBlock2);

      // L1 confirms checkpoint 1 with the same block 1 as local. Speculative block 2 must survive.
      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([localBlock1]), 10)]);

      const storedBlock2 = await store.blocks.getBlock({ number: BlockNumber(2) });
      expect(storedBlock2?.archive.root.equals(localBlock2.archive.root)).toBe(true);
    });

    it('removes contract data when checkpoints are unwound', async () => {
      // Create block with contract data and add it as a checkpoint
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      const publishedCheckpoint = makePublishedCheckpoint(makeCheckpoint([block]), 10);

      await updater.addCheckpoints([publishedCheckpoint]);

      // Verify contract data was stored
      const timestamp = block.header.globalVariables.timestamp + 1n;
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Remove the checkpoint
      await updater.removeCheckpointsAfter(CheckpointNumber(0));

      // Verify the contract data was removed
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
    });
  });

  describe('logs handling', () => {
    // Helper: every public log's `fields[0]` is the tag. We query each unique (contract, tag) pair to
    // recover the indexed logs without depending on the removed `getPublicLogs(LogFilter)` API.
    async function countIndexedPublicLogs(block: L2Block): Promise<number> {
      const seen = new Set<string>();
      let total = 0;
      for (const tx of block.body.txEffects) {
        for (const log of tx.publicLogs) {
          const key = `${log.contractAddress.toString()}|${log.fields[0].toString()}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const res = await store.logs.getPublicLogsByTags({
            contractAddress: log.contractAddress,
            tags: [new Tag(log.fields[0])],
          });
          total += res[0].length;
        }
      }
      return total;
    }

    it('does not duplicate logs when checkpoint contains same block as provisional', async () => {
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });

      await updater.addProposedBlock(block);

      // Create checkpoint with the SAME block (same archive root)
      const publishedCheckpoint = makePublishedCheckpoint(makeCheckpoint([block]), 10);

      await updater.addCheckpoints([publishedCheckpoint]);

      const expected = block.body.txEffects.flatMap(tx => tx.publicLogs).length;
      const indexed = await countIndexedPublicLogs(block);
      expect(indexed).toBe(expected);
      expect(indexed).toBeGreaterThan(0);
    });

    it('replaces logs when checkpoint conflicts with provisional block', async () => {
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock);
      expect(await countIndexedPublicLogs(localBlock)).toBe(
        localBlock.body.txEffects.flatMap(tx => tx.publicLogs).length,
      );

      const checkpointBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      expect(checkpointBlock.archive.root.equals(localBlock.archive.root)).toBe(false);

      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([checkpointBlock]), 10)]);

      const storedBlock = await store.blocks.getBlock({ number: BlockNumber(1) });
      expect(storedBlock?.archive.root.equals(checkpointBlock.archive.root)).toBe(true);

      expect(await countIndexedPublicLogs(checkpointBlock)).toBe(
        checkpointBlock.body.txEffects.flatMap(tx => tx.publicLogs).length,
      );
      // The old (now-removed) block's logs are no longer indexed.
      expect(await countIndexedPublicLogs(localBlock)).toBe(0);
    });

    it('removes logs when removing uncheckpointed blocks', async () => {
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock);
      expect(await countIndexedPublicLogs(localBlock)).toBe(
        localBlock.body.txEffects.flatMap(tx => tx.publicLogs).length,
      );

      await updater.removeUncheckpointedBlocksAfter(BlockNumber.ZERO);

      expect(await countIndexedPublicLogs(localBlock)).toBe(0);
    });
  });

  describe('l2 tips cache refresh', () => {
    it('does not refresh the cache when the writer transaction aborts', async () => {
      const initialBlockHash = await BlockHeader.empty().hash();
      const tipsCache = new L2TipsCache(store.blocks, initialBlockHash);
      const updaterWithCache = new ArchiverDataStoreUpdater(store, tipsCache);

      const tipsBefore = await tipsCache.getL2Tips();

      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const failure = new Error('forced failure inside writer transaction');
      const addProposedBlockSpy = jest.spyOn(store.blocks, 'addProposedBlock').mockRejectedValueOnce(failure);

      await expect(updaterWithCache.addProposedBlock(block)).rejects.toBe(failure);

      const tipsAfter = await tipsCache.getL2Tips();
      expect(tipsAfter).toEqual(tipsBefore);

      addProposedBlockSpy.mockRestore();
    });
  });
});
