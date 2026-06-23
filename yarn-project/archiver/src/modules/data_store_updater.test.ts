import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import '@aztec/stdlib/testing/jest';

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { KVArchiverDataStore } from '../store/kv_archiver_store.js';
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
  let store: KVArchiverDataStore;
  let updater: ArchiverDataStoreUpdater;
  let contractClassLog: ContractClassLog;
  let contractClassId: Fr;
  let instanceAddress: AztecAddress;

  beforeEach(async () => {
    store = new KVArchiverDataStore(await openTmpStore('data_store_updater_test'), 1000);
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
      const retrievedClass = await store.getContractClass(contractClassId);
      expect(retrievedClass).toBeDefined();
      expect(retrievedClass?.id.equals(contractClassId)).toBe(true);

      // Verify contract instance was stored (use a timestamp after block creation)
      const timestamp = block.header.globalVariables.timestamp + 1n;
      const retrievedInstance = await store.getContractInstance(instanceAddress, timestamp);
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
      expect(await store.getContractClass(contractClassId)).toBeDefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeDefined();

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
      expect(await store.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
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
      expect(await store.getContractClass(contractClassId)).toBeDefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Remove the checkpoint
      await updater.removeCheckpointsAfter(CheckpointNumber(0));

      // Verify the contract data was removed
      expect(await store.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
    });
  });

  describe('logs handling', () => {
    it('does not duplicate logs when checkpoint contains same block as provisional', async () => {
      // Add provisional block with some logs
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });

      await updater.addProposedBlock(block);

      // Create checkpoint with the SAME block (same archive root)
      const publishedCheckpoint = makePublishedCheckpoint(makeCheckpoint([block]), 10);

      await updater.addCheckpoints([publishedCheckpoint]);

      // Verify logs are NOT duplicated
      const publicLogs = await store.getPublicLogs({ fromBlock: block.number, toBlock: block.number + 1 });
      expect(publicLogs.logs.length).toBe(block.body.txEffects.flatMap(tx => tx.publicLogs).length);
      expect(publicLogs.logs.length).toBeGreaterThan(0);
    });

    it('replaces logs when checkpoint conflicts with provisional block', async () => {
      // Add local provisional block
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock);
      const publicLogsBefore = await store.getPublicLogs({});
      expect(publicLogsBefore.logs.map(l => l.log)).toEqual(localBlock.body.txEffects.flatMap(tx => tx.publicLogs));

      // Create checkpoint with DIFFERENT block (different archive root)
      const checkpointBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      expect(checkpointBlock.archive.root.equals(localBlock.archive.root)).toBe(false);

      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([checkpointBlock]), 10)]);

      // Verify checkpoint block is stored
      const storedBlock = await store.getBlock(BlockNumber(1));
      expect(storedBlock?.archive.root.equals(checkpointBlock.archive.root)).toBe(true);
      const publicLogsAfter = await store.getPublicLogs({});
      expect(publicLogsAfter.logs.map(l => l.log)).toEqual(checkpointBlock.body.txEffects.flatMap(tx => tx.publicLogs));
    });

    it('removes logs when removing uncheckpointed blocks', async () => {
      // Add local provisional block
      const localBlock = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock);
      const publicLogsBefore = await store.getPublicLogs({});
      expect(publicLogsBefore.logs.map(l => l.log)).toEqual(localBlock.body.txEffects.flatMap(tx => tx.publicLogs));

      // Remove the uncheckpointed block
      await updater.removeUncheckpointedBlocksAfter(BlockNumber.ZERO);

      // Verify logs are removed
      const publicLogsAfter = await store.getPublicLogs({});
      expect(publicLogsAfter.logs.length).toBe(0);
    });
  });

  describe('l2 tips cache refresh', () => {
    it('does not refresh the cache when the writer transaction aborts', async () => {
      const tipsCache = new L2TipsCache(store.blockStore);
      const updaterWithCache = new ArchiverDataStoreUpdater(store, tipsCache);

      const tipsBefore = await tipsCache.getL2Tips();

      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const failure = new Error('forced failure inside writer transaction');
      const addProposedBlockSpy = jest.spyOn(store.blockStore, 'addProposedBlock').mockRejectedValueOnce(failure);

      await expect(updaterWithCache.addProposedBlock(block)).rejects.toBe(failure);
      await expect(tipsCache.getL2Tips()).resolves.toEqual(tipsBefore);

      addProposedBlockSpy.mockRestore();
    });
  });
});
