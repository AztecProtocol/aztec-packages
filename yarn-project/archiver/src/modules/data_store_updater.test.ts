import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { getPublishableStandardContracts } from '@aztec/standard-contracts';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GENESIS_BLOCK_HEADER_HASH, L2Block } from '@aztec/stdlib/block';
import { ContractClassLog, ContractClassLogFields, PrivateLog } from '@aztec/stdlib/logs';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import '@aztec/stdlib/testing/jest';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { registerProtocolContracts, registerStandardContracts } from '../factory.js';
import { type ArchiverDataStores, createArchiverDataStores } from '../store/data_stores.js';
import { L2FrontierCache } from '../store/l2_frontier_cache.js';
import { makeCheckpoint, makePublishedCheckpoint } from '../test/mock_structs.js';
import { ArchiverDataStoreUpdater } from './data_store_updater.js';

/**
 * Builds a ContractClassPublished log for a real bundled protocol contract class. The log carries the
 * protocol contract's actual fields so that the class id the data store updater recomputes matches the
 * bundled protocol class id (otherwise the updater would skip it as a mismatched id).
 */
function buildProtocolContractClassLog(contractClass: {
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  packedBytecode: Buffer;
  id: Fr;
}): ContractClassLog {
  const fields = [
    new Fr(CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE),
    contractClass.id,
    new Fr(1), // version
    contractClass.artifactHash,
    contractClass.privateFunctionsRoot,
    // The remaining fields encode the packed bytecode; size it to fill the rest of the log so that
    // ContractClassPublishedEvent.fromLog reads back the full bytecode buffer.
    ...bufferAsFields(contractClass.packedBytecode, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - 5),
  ];
  return new ContractClassLog(
    ProtocolContractAddress.ContractClassRegistry,
    new ContractClassLogFields(fields),
    fields.length,
  );
}

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
    store = createArchiverDataStores(await openTmpStore('data_store_updater_test'), GENESIS_BLOCK_HEADER_HASH);
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

    it('treats an on-chain re-publish of a preloaded protocol contract class as idempotent (A-1257)', async () => {
      // Protocol contracts are preloaded at synthetic block 0 via registerProtocolContracts. When a
      // bundled protocol contract class is later (re-)published on chain, the archiver must not throw
      // when re-adding the already-present class, which would otherwise stall L1 sync.
      await registerProtocolContracts(store);

      const provider = new BundledProtocolContractsProvider();
      const protocolContract = await provider.getProtocolContractArtifact('ContractClassRegistry');
      const protocolClassId = protocolContract.contractClass.id;

      // The class is queryable from the block-0 preload.
      expect(await store.contractClasses.getContractClass(protocolClassId)).toBeDefined();

      // Build a block whose tx emits a ContractClassPublished log for the bundled protocol class id.
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [buildProtocolContractClassLog(protocolContract.contractClass)];

      // Sanity check: the log decodes to the expected protocol class id (so the updater does not skip it).
      expect(
        ContractClassPublishedEvent.fromLog(block.body.txEffects[0].contractClassLogs[0]).contractClassId.equals(
          protocolClassId,
        ),
      ).toBe(true);

      // Adding the block must not throw, and the protocol class must remain queryable afterwards.
      await expect(updater.addProposedBlock(block)).resolves.not.toThrow();
      expect(await store.contractClasses.getContractClass(protocolClassId)).toBeDefined();
    });

    it('preloads standard contract classes and instances via registerStandardContracts', async () => {
      const standardContracts = await getPublishableStandardContracts();
      expect(standardContracts.length).toBeGreaterThan(0);

      // Not present before the preload.
      for (const { contractClass } of standardContracts) {
        expect(await store.contractClasses.getContractClass(contractClass.id)).toBeUndefined();
      }

      await registerStandardContracts(store);

      // Both the class and the instance are queryable from the block-0 preload.
      for (const { contractClass, address } of standardContracts) {
        const retrievedClass = await store.contractClasses.getContractClass(contractClass.id);
        expect(retrievedClass?.id.equals(contractClass.id)).toBe(true);
        const retrievedInstance = await store.contractInstances.getContractInstance(address, 1n);
        expect(retrievedInstance?.address.equals(address)).toBe(true);
      }

      // Calling again (e.g. on node restart with a persisted store) is idempotent and must not throw.
      await expect(registerStandardContracts(store)).resolves.not.toThrow();
      for (const { contractClass } of standardContracts) {
        expect(await store.contractClasses.getContractClass(contractClass.id)).toBeDefined();
      }
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

    it('accepts a re-included already-stored checkpoint carrying contract data (A-1350)', async () => {
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      const checkpoint = makeCheckpoint([block]);
      await updater.addCheckpoints([makePublishedCheckpoint(checkpoint, 10)]);
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();

      // Simulate an L1 reorg that re-includes the same checkpoint at a later L1 block.
      await expect(updater.addCheckpoints([makePublishedCheckpoint(checkpoint, 999)])).resolves.toBeDefined();

      // L1 metadata must reflect the re-inclusion and contract data must still be present.
      const stored = await store.blocks.getCheckpointData(CheckpointNumber(1));
      expect(stored?.l1.blockNumber).toBe(999n);
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();
      const timestamp = block.header.globalVariables.timestamp + 1n;
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();
    });

    it('extracts only the newly-inserted suffix when a re-included checkpoint is batched with a new one (A-1350)', async () => {
      // Checkpoint 1 (block 1) carries the contract class log; checkpoint 2 (block 2) carries the
      // contract instance log. Ingest checkpoint 1, then re-present it (at a new L1 block) batched with
      // the brand-new checkpoint 2. Only checkpoint 2's block is new, so its instance must be extracted
      // while re-extracting checkpoint 1's already-stored class is skipped rather than throwing.
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block1.body.txEffects[0].contractClassLogs = [contractClassLog];

      const checkpoint1 = makeCheckpoint([block1]);
      await updater.addCheckpoints([makePublishedCheckpoint(checkpoint1, 10)]);
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();

      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: block1.archive,
      });
      block2.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];
      const checkpoint2 = makeCheckpoint([block2], CheckpointNumber(2));

      // Re-present checkpoint 1 at a new L1 block, batched with the new checkpoint 2.
      await expect(
        updater.addCheckpoints([makePublishedCheckpoint(checkpoint1, 999), makePublishedCheckpoint(checkpoint2, 20)]),
      ).resolves.toBeDefined();

      // Checkpoint 1's class stays stored (not re-extracted), and checkpoint 2's instance was extracted.
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();
      const timestamp = block2.header.globalVariables.timestamp + 1n;
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();
    });
  });

  describe('logs handling', () => {
    /**
     * Counts how many indexed public logs at `block.number` come from `block`'s txs. Compares the indexed
     * logs' `txHash` against the block's tx-effect hashes, so an orphan write from a different block at
     * the same number (e.g. after a slot conflict swap) doesn't get counted.
     */
    async function countIndexedPublicLogs(block: L2Block): Promise<number> {
      const expectedTxHashes = new Set(block.body.txEffects.map(tx => tx.txHash.toString()));
      const indexed = await store.logs.getPublicLogsForBlock(block.number);
      return indexed.filter(log => expectedTxHashes.has(log.txHash.toString())).length;
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

  describe('L2 frontier cache refresh', () => {
    it('does not refresh the cache when the writer transaction aborts', async () => {
      const initialBlockHash = await BlockHeader.empty().hash();
      const l2FrontierCache = new L2FrontierCache(store.blocks, initialBlockHash);
      const updaterWithCache = new ArchiverDataStoreUpdater(store, l2FrontierCache);

      const tipsBefore = await l2FrontierCache.getL2Tips();

      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const failure = new Error('forced failure inside writer transaction');
      const addProposedBlockSpy = jest.spyOn(store.blocks, 'addProposedBlock').mockRejectedValueOnce(failure);

      await expect(updaterWithCache.addProposedBlock(block)).rejects.toBe(failure);

      const tipsAfter = await l2FrontierCache.getL2Tips();
      expect(tipsAfter).toEqual(tipsBefore);

      addProposedBlockSpy.mockRestore();
    });

    it('serves tips and the proposed checkpoint from the same instant while a promotion commits', async () => {
      const initialBlockHash = await BlockHeader.empty().hash();
      const l2FrontierCache = new L2FrontierCache(store.blocks, initialBlockHash);
      const updaterWithCache = new ArchiverDataStoreUpdater(store, l2FrontierCache);

      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updaterWithCache.addProposedBlock(block);
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });
      await l2FrontierCache.refresh();

      // Park the promotion transaction after it has committed but before the updater refreshes the cache,
      // which is the window a concurrent reader can land in.
      const { promise: committed, resolve: markCommitted } = promiseWithResolvers<void>();
      const { promise: gate, resolve: openGate } = promiseWithResolvers<void>();
      const realTransactionAsync = store.db.transactionAsync.bind(store.db);
      const transactionSpy = jest.spyOn(store.db, 'transactionAsync').mockImplementationOnce(async callback => {
        const result = await realTransactionAsync(callback);
        markCommitted();
        await gate;
        return result;
      });

      const publishedCheckpoint = makePublishedCheckpoint(makeCheckpoint([block]), 10);
      const promotion = updaterWithCache.addCheckpoints([], undefined, {
        l1: publishedCheckpoint.l1,
        attestations: publishedCheckpoint.attestations,
        checkpoint: publishedCheckpoint,
      });

      await committed;
      const frontier = await l2FrontierCache.getL2Frontier();
      openGate();
      await promotion;

      // The proposed-checkpoint frontier and the proposed tip describe the same chain: a reader can see
      // the pre-promotion snapshot or the post-promotion one, never a mix of the two.
      const frontierBlock = frontier.proposedCheckpoint
        ? BlockNumber.add(frontier.proposedCheckpoint.startBlock, frontier.proposedCheckpoint.blockCount - 1)
        : frontier.tips.checkpointed.block.number;
      expect(frontierBlock).toEqual(frontier.tips.proposed.number);

      // The header comes from the same transaction as the tips, so it always describes the proposed tip.
      expect(frontier.latestBlockHeader?.globalVariables.blockNumber).toEqual(frontier.tips.proposed.number);
      expect(frontier.pendingChainValidationStatus).toEqual({ valid: true });

      transactionSpy.mockRestore();
    });
  });

  describe('removeUncheckpointedBlocksAfter (automine optimistic-insert recovery)', () => {
    /** Adds one proposed block plus its proposed checkpoint (one block per checkpoint, as automine does). */
    const addProposedBlockWithCheckpoint = async (
      blockNumber: number,
      checkpointNumber: number,
      slotNumber: number,
      previousBlock?: L2Block,
    ): Promise<L2Block> => {
      const block = await L2Block.random(BlockNumber(blockNumber), {
        checkpointNumber: CheckpointNumber(checkpointNumber),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(slotNumber),
        ...(previousBlock ? { lastArchive: previousBlock.archive } : {}),
      });
      await updater.addProposedBlock(block);
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(checkpointNumber),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(blockNumber),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });
      return block;
    };

    it('removes the optimistic proposed block and evicts its proposed checkpoint at genesis', async () => {
      const block = await addProposedBlockWithCheckpoint(1, 1, 100);
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
      expect((await store.blocks.getLastProposedCheckpoint())?.checkpointNumber).toBe(1);

      const removed = await updater.removeUncheckpointedBlocksAfter(BlockNumber(0));

      expect(removed.map(b => b.number)).toEqual([1]);
      expect(removed[0].archive.root.equals(block.archive.root)).toBe(true);
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeUndefined();
      expect(await store.blocks.getLastProposedCheckpoint()).toBeUndefined();
    });

    it('drops a proposed checkpoint built on the checkpointed tip without touching checkpointed state', async () => {
      // Checkpointed checkpoint 1 (block 1).
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([block1]), 10)]);

      // Optimistic proposed checkpoint 2 (block 2) on top.
      const block2 = await addProposedBlockWithCheckpoint(2, 2, 101, block1);
      expect(await store.blocks.getBlock({ number: BlockNumber(2) })).toBeDefined();

      const removed = await updater.removeUncheckpointedBlocksAfter(BlockNumber(1));

      expect(removed.map(b => b.number)).toEqual([2]);
      expect(removed[0].archive.root.equals(block2.archive.root)).toBe(true);
      expect(await store.blocks.getBlock({ number: BlockNumber(2) })).toBeUndefined();
      expect(await store.blocks.getLastProposedCheckpoint()).toBeUndefined();
      // Checkpointed checkpoint 1 and its block survive.
      expect(await store.blocks.getCheckpointData(CheckpointNumber(1))).toBeDefined();
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
    });

    it('evicts only proposed checkpoints from the pruned block onward, keeping earlier ones', async () => {
      const block1 = await addProposedBlockWithCheckpoint(1, 1, 100);
      await addProposedBlockWithCheckpoint(2, 2, 101, block1);

      const removed = await updater.removeUncheckpointedBlocksAfter(BlockNumber(1));

      expect(removed.map(b => b.number)).toEqual([2]);
      // Block 1 and its proposed checkpoint are untouched; only checkpoint 2 (the pruned block) is evicted.
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
      expect((await store.blocks.getLastProposedCheckpoint())?.checkpointNumber).toBe(1);
    });

    it('refuses to remove checkpointed blocks', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([block1]), 10)]);

      await expect(updater.removeUncheckpointedBlocksAfter(BlockNumber(0))).rejects.toThrow(
        /checkpointed blocks exist up to 1/,
      );
    });
  });
});
