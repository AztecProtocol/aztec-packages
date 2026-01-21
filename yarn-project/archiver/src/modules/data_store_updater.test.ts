import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import '@aztec/stdlib/testing/jest';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { KVArchiverDataStore } from '../store/kv_archiver_store.js';
import { makePublishedCheckpoint } from '../test/mock_structs.js';
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
    store = new KVArchiverDataStore(await openTmpStore('data_store_updater_test'));
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
    it('stores contract class and instance data when blocks are added via addBlocks', async () => {
      // Create block with contract class and instance logs
      const block = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      await updater.addBlocks([block]);

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
      const localBlock = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      localBlock.body.txEffects[0].contractClassLogs = [contractClassLog];
      localBlock.body.txEffects[0].privateLogs = [
        PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload()),
      ];

      await updater.addBlocks([localBlock]);

      // Verify contract data was stored
      const timestamp = localBlock.header.globalVariables.timestamp + 1n;
      expect(await store.getContractClass(contractClassId)).toBeDefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Now create a checkpoint with a conflicting block (same slot but different archive root)
      const conflictingBlock = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100), // Same slot as local block
      });
      // Make sure it has a different archive root (which it will by default from random)
      expect(conflictingBlock.archive.root.equals(localBlock.archive.root)).toBe(false);

      const checkpointWithConflict = new Checkpoint(
        conflictingBlock.archive,
        CheckpointHeader.random({ slotNumber: SlotNumber(100) }),
        [conflictingBlock],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpointWithConflict, 10);

      // setCheckpointData should detect the conflict and prune the local block
      await updater.setNewCheckpointData([publishedCheckpoint]);

      // Verify the contract data from the local block was removed
      expect(await store.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
    });

    it('removes contract data when checkpoints are unwound', async () => {
      // Create block with contract data and add it as a checkpoint
      const block = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      const checkpoint = new Checkpoint(block.archive, CheckpointHeader.random(), [block], CheckpointNumber(1));
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await updater.setNewCheckpointData([publishedCheckpoint]);

      // Verify contract data was stored
      const timestamp = block.header.globalVariables.timestamp + 1n;
      expect(await store.getContractClass(contractClassId)).toBeDefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Unwind the checkpoint
      await updater.unwindCheckpoints(CheckpointNumber(1), 1);

      // Verify the contract data was removed
      expect(await store.getContractClass(contractClassId)).toBeUndefined();
      expect(await store.getContractInstance(instanceAddress, timestamp)).toBeUndefined();
    });
  });

  describe('logs handling', () => {
    it('does not duplicate logs when checkpoint contains same block as provisional', async () => {
      // Add provisional block with some logs
      const block = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });

      await updater.addBlocks([block]);

      // Create checkpoint with the SAME block (same archive root)
      const checkpoint = new Checkpoint(block.archive, CheckpointHeader.random(), [block], CheckpointNumber(1));
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await updater.setNewCheckpointData([publishedCheckpoint]);

      // Verify logs are NOT duplicated
      const publicLogs = await store.getPublicLogs({ fromBlock: block.number, toBlock: block.number + 1 });
      expect(publicLogs.logs.length).toBe(block.body.txEffects.flatMap(tx => tx.publicLogs).length);
      expect(publicLogs.logs.length).toBeGreaterThan(0);
    });

    it('replaces logs when checkpoint conflicts with provisional block', async () => {
      // Add local provisional block
      const localBlock = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addBlocks([localBlock]);
      const publicLogsBefore = await store.getPublicLogs({});
      expect(publicLogsBefore.logs.map(l => l.log)).toEqual(localBlock.body.txEffects.flatMap(tx => tx.publicLogs));

      // Create checkpoint with DIFFERENT block (different archive root)
      const checkpointBlock = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      expect(checkpointBlock.archive.root.equals(localBlock.archive.root)).toBe(false);

      const checkpoint = new Checkpoint(
        checkpointBlock.archive,
        CheckpointHeader.random({ slotNumber: SlotNumber(100) }),
        [checkpointBlock],
        CheckpointNumber(1),
      );
      await updater.setNewCheckpointData([makePublishedCheckpoint(checkpoint, 10)]);

      // Verify checkpoint block is stored
      const storedBlock = await store.getBlock(BlockNumber(1));
      expect(storedBlock?.archive.root.equals(checkpointBlock.archive.root)).toBe(true);
      const publicLogsAfter = await store.getPublicLogs({});
      expect(publicLogsAfter.logs.map(l => l.log)).toEqual(checkpointBlock.body.txEffects.flatMap(tx => tx.publicLogs));
    });

    it('removes logs when unwinding blocks', async () => {
      // Add local provisional block
      const localBlock = await L2BlockNew.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addBlocks([localBlock]);
      const publicLogsBefore = await store.getPublicLogs({});
      expect(publicLogsBefore.logs.map(l => l.log)).toEqual(localBlock.body.txEffects.flatMap(tx => tx.publicLogs));

      // Unwind the block
      await updater.removeBlocksAfter(BlockNumber.ZERO);

      // Verify logs are removed
      const publicLogsAfter = await store.getPublicLogs({});
      expect(publicLogsAfter.logs.length).toBe(0);
    });
  });
});
