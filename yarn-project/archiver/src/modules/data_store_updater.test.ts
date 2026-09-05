import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
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
import { InboxMessagePrefixRef } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import '@aztec/stdlib/testing/jest';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  InboxConsumptionRewindsError,
  InboxMessagePrefixChangedError,
  InboxPrefixMismatchError,
  InboxPrefixNotSyncedError,
  NoProposedCheckpointToPromoteError,
} from '../errors.js';
import { registerProtocolContracts, registerStandardContracts } from '../factory.js';
import { type ArchiverDataStores, createArchiverDataStores } from '../store/data_stores.js';
import { L2TipsCache } from '../store/l2_tips_cache.js';
import {
  makeCheckpoint,
  makeInboxMessages,
  makeL1PublishedData,
  makePublishedCheckpoint,
} from '../test/mock_structs.js';
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

/** The reference every block consuming no Inbox messages carries. */
const emptyPrefix = InboxMessagePrefixRef.empty();

/**
 * A random block whose header consumes no Inbox messages (leaf count zero), so the proposed-block insertion guard
 * accepts it against a message store that has synced nothing.
 */
async function randomBlock(blockNumber: number, opts: Parameters<typeof L2Block.random>[1] = {}): Promise<L2Block> {
  const block = await L2Block.random(BlockNumber(blockNumber), opts);
  block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex = 0;
  return block;
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
      const block = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block.body.txEffects[0].contractClassLogs = [contractClassLog];
      block.body.txEffects[0].privateLogs = [PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload())];

      await updater.addProposedBlock(block, emptyPrefix);

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
      const block = await randomBlock(1, {
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
      await expect(updater.addProposedBlock(block, emptyPrefix)).resolves.not.toThrow();
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
      const localBlock = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      localBlock.body.txEffects[0].contractClassLogs = [contractClassLog];
      localBlock.body.txEffects[0].privateLogs = [
        PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload()),
      ];

      await updater.addProposedBlock(localBlock, emptyPrefix);

      // Verify contract data was stored
      const timestamp = localBlock.header.globalVariables.timestamp + 1n;
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // Now create a checkpoint with a conflicting block (same slot but different archive root)
      const conflictingBlock = await randomBlock(1, {
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
      const localBlock = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(125),
      });
      localBlock.body.txEffects[0].contractClassLogs = [contractClassLog];
      localBlock.body.txEffects[0].privateLogs = [
        PrivateLog.fromBuffer(getSampleContractInstancePublishedEventPayload()),
      ];
      await updater.addProposedBlock(localBlock, emptyPrefix);

      const timestamp = localBlock.header.globalVariables.timestamp + 1n;
      expect(await store.contractInstances.getContractInstance(instanceAddress, timestamp)).toBeDefined();

      // L1 confirmed a different block 1 at slot 124, containing the SAME deployed contract instance
      // (the same user tx ended up on chain, just signed by a different proposer at a different slot).
      // Without the fix the prune step misses the conflict because the slot does not match, and
      // re-applying the L1 block's contract data throws "Contract instance ... already exists".
      const l1Block = await randomBlock(1, {
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
      const localBlock1 = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(125),
      });
      await updater.addProposedBlock(localBlock1, emptyPrefix);
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });

      const localBlock2 = await randomBlock(2, {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(126),
        lastArchive: localBlock1.archive,
      });
      await updater.addProposedBlock(localBlock2, emptyPrefix);
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
      const l1Block = await randomBlock(1, {
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
      const localBlock1 = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock1, emptyPrefix);

      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });

      const localBlock2 = await randomBlock(2, {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(101),
        lastArchive: localBlock1.archive,
      });
      await updater.addProposedBlock(localBlock2, emptyPrefix);

      // L1 confirms checkpoint 1 with the same block 1 as local. Speculative block 2 must survive.
      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([localBlock1]), 10)]);

      const storedBlock2 = await store.blocks.getBlock({ number: BlockNumber(2) });
      expect(storedBlock2?.archive.root.equals(localBlock2.archive.root)).toBe(true);
    });

    it('removes contract data when checkpoints are unwound', async () => {
      // Create block with contract data and add it as a checkpoint
      const block = await randomBlock(1, {
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
      const block = await randomBlock(1, {
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
      const block1 = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      block1.body.txEffects[0].contractClassLogs = [contractClassLog];

      const checkpoint1 = makeCheckpoint([block1]);
      await updater.addCheckpoints([makePublishedCheckpoint(checkpoint1, 10)]);
      expect(await store.contractClasses.getContractClass(contractClassId)).toBeDefined();

      const block2 = await randomBlock(2, {
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
      const block = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });

      await updater.addProposedBlock(block, emptyPrefix);

      // Create checkpoint with the SAME block (same archive root)
      const publishedCheckpoint = makePublishedCheckpoint(makeCheckpoint([block]), 10);

      await updater.addCheckpoints([publishedCheckpoint]);

      const expected = block.body.txEffects.flatMap(tx => tx.publicLogs).length;
      const indexed = await countIndexedPublicLogs(block);
      expect(indexed).toBe(expected);
      expect(indexed).toBeGreaterThan(0);
    });

    it('replaces logs when checkpoint conflicts with provisional block', async () => {
      const localBlock = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock, emptyPrefix);
      expect(await countIndexedPublicLogs(localBlock)).toBe(
        localBlock.body.txEffects.flatMap(tx => tx.publicLogs).length,
      );

      const checkpointBlock = await randomBlock(1, {
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
      const localBlock = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      await updater.addProposedBlock(localBlock, emptyPrefix);
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

      const block = await randomBlock(1, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const failure = new Error('forced failure inside writer transaction');
      const addProposedBlockSpy = jest.spyOn(store.blocks, 'addProposedBlock').mockRejectedValueOnce(failure);

      await expect(updaterWithCache.addProposedBlock(block, emptyPrefix)).rejects.toBe(failure);

      const tipsAfter = await tipsCache.getL2Tips();
      expect(tipsAfter).toEqual(tipsBefore);

      addProposedBlockSpy.mockRestore();
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
      const block = await randomBlock(blockNumber, {
        checkpointNumber: CheckpointNumber(checkpointNumber),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(slotNumber),
        ...(previousBlock ? { lastArchive: previousBlock.archive } : {}),
      });
      await updater.addProposedBlock(block, emptyPrefix);
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
      const block1 = await randomBlock(1, {
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
      const block1 = await randomBlock(1, {
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

  describe('addProposedBlock Inbox prefix guard', () => {
    /** A random block consuming through `leafCount` messages, chained on `previousBlock` when given. */
    const makeConsumingBlock = async (blockNumber: number, leafCount: number, previousBlock?: L2Block) => {
      const block = await randomBlock(blockNumber, {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(blockNumber - 1),
        slotNumber: SlotNumber(100),
        ...(previousBlock ? { lastArchive: previousBlock.archive } : {}),
      });
      block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex = leafCount;
      return block;
    };
    const refAt = async (leafCount: number) =>
      InboxMessagePrefixRef.fromPosition((await store.messages.getMessagePosition(BigInt(leafCount)))!);
    const storeIsUntouched = async (block: L2Block) => {
      expect(await store.blocks.getBlock({ number: block.number })).toBeUndefined();
      expect(await store.logs.getPublicLogsForBlock(block.number)).toEqual([]);
      expect(await store.blocks.getLatestL2BlockNumber()).toBe(0);
    };

    beforeEach(async () => {
      await store.messages.addL1ToL2Messages(makeInboxMessages(5));
    });

    it('accepts a block whose signed prefix matches the local messages at its leaf count', async () => {
      const block = await makeConsumingBlock(1, 3);
      await updater.addProposedBlock(block, await refAt(3));
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
    });

    it('accepts a prefix interior to the synced log and is unaffected by messages appended after it', async () => {
      const block = await makeConsumingBlock(1, 3);
      const ref = await refAt(3);
      await store.messages.addL1ToL2Messages(
        makeInboxMessages(2, {
          initialIndex: 5n,
          initialInboxHash: (await store.messages.getSyncedMessagePosition()).rollingHash,
        }),
      );
      await updater.addProposedBlock(block, ref);
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
    });

    it('rejects a mismatching prefix and writes nothing', async () => {
      const block = await makeConsumingBlock(1, 3);
      await expect(updater.addProposedBlock(block, InboxMessagePrefixRef.random())).rejects.toThrow(
        InboxPrefixMismatchError,
      );
      await storeIsUntouched(block);
    });

    it('rejects a prefix the local view has not synced and writes nothing', async () => {
      const block = await makeConsumingBlock(1, 9);
      await expect(updater.addProposedBlock(block, InboxMessagePrefixRef.random())).rejects.toThrow(
        InboxPrefixNotSyncedError,
      );
      await storeIsUntouched(block);
    });

    it('rejects a block consuming behind its parent', async () => {
      const parent = await makeConsumingBlock(1, 3);
      await updater.addProposedBlock(parent, await refAt(3));
      const block = await makeConsumingBlock(2, 2, parent);
      await expect(updater.addProposedBlock(block, await refAt(2))).rejects.toThrow(InboxConsumptionRewindsError);
      expect(await store.blocks.getBlock({ number: BlockNumber(2) })).toBeUndefined();
    });

    it('rejects a block whose prefix matched an earlier version of the log after a suffix replacement', async () => {
      const block = await makeConsumingBlock(1, 5);
      const staleRef = await refAt(5);
      // A reorg replaces the last two messages before the block is inserted.
      await store.messages.removeL1ToL2Messages(3n);
      const hashAtThree = (await store.messages.getSyncedMessagePosition()).rollingHash;
      await store.messages.addL1ToL2Messages(
        makeInboxMessages(2, {
          initialIndex: 3n,
          initialInboxHash: hashAtThree,
        }),
      );
      await expect(updater.addProposedBlock(block, staleRef)).rejects.toThrow(InboxPrefixMismatchError);
      await storeIsUntouched(block);
    });
  });

  describe('replaceMessageSuffixAndPruneProposedBlocks', () => {
    const syncState = { l1Block: { l1BlockNumber: 200n, l1BlockHash: Buffer32.random() } };
    let messages: ReturnType<typeof makeInboxMessages>;

    /** A block consuming through `leafCount` messages, chained on `previousBlock` when given. */
    const makeConsumingBlock = async (blockNumber: number, leafCount: number, previousBlock?: L2Block) => {
      const block = await randomBlock(blockNumber, {
        checkpointNumber: CheckpointNumber(previousBlock ? previousBlock.checkpointNumber : 1),
        indexWithinCheckpoint: IndexWithinCheckpoint(blockNumber - 1),
        slotNumber: SlotNumber(100),
        ...(previousBlock ? { lastArchive: previousBlock.archive } : {}),
      });
      block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex = leafCount;
      return block;
    };
    const positionAt = async (count: number) => (await store.messages.getMessagePosition(BigInt(count)))!;
    const storedLeaves = async () => (await toArray(store.messages.iterateL1ToL2Messages())).map(m => m.leaf);
    /** Replacement messages continuing the stored chain from `fromIndex`. */
    const replacementFrom = async (fromIndex: number, count: number) =>
      makeInboxMessages(count, {
        initialIndex: BigInt(fromIndex),
        initialInboxHash: (await positionAt(fromIndex)).rollingHash,
      });

    beforeEach(async () => {
      messages = makeInboxMessages(6);
      await store.messages.addL1ToL2Messages(messages);
    });

    it('replaces the suffix, moves the syncpoint and prunes from the first block consuming a replaced message', async () => {
      const block1 = await makeConsumingBlock(1, 3);
      const block2 = await makeConsumingBlock(2, 5, block1);
      const block3 = await makeConsumingBlock(3, 6, block2);
      for (const [block, count] of [
        [block1, 3],
        [block2, 5],
        [block3, 6],
      ] as const) {
        await updater.addProposedBlock(block, InboxMessagePrefixRef.fromPosition(await positionAt(count)));
      }
      const replacement = await replacementFrom(4, 3);

      const result = await updater.replaceMessageSuffixAndPruneProposedBlocks({
        firstDivergentIndex: 4n,
        expectedPrefix: await positionAt(4),
        messages: replacement,
        syncState,
      });

      expect(await storedLeaves()).toEqual([...messages.slice(0, 4), ...replacement].map(m => m.leaf));
      expect(await store.messages.getSynchedL1Block()).toEqual(syncState.l1Block);
      // Block 1 consumed only messages before the divergence; block 2 consumed message 4 and block 3 chains on it.
      expect(result.prunedBlocks.map(b => b.number)).toEqual([2, 3]);
      expect(result.checkpointedTipAffected).toBe(false);
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
      expect(await store.blocks.getBlock({ number: BlockNumber(2) })).toBeUndefined();
      expect(await store.blocks.getLatestL2BlockNumber()).toBe(1);
    });

    it('refuses a replacement whose comparison prefix has moved and writes nothing', async () => {
      const block = await makeConsumingBlock(1, 6);
      await updater.addProposedBlock(block, InboxMessagePrefixRef.fromPosition(await positionAt(6)));
      const replacement = await replacementFrom(4, 1);

      await expect(
        updater.replaceMessageSuffixAndPruneProposedBlocks({
          firstDivergentIndex: 4n,
          expectedPrefix: { totalMessageCount: 4n, rollingHash: Fr.random() },
          messages: replacement,
          syncState,
        }),
      ).rejects.toThrow(InboxMessagePrefixChangedError);

      expect(await storedLeaves()).toEqual(messages.map(m => m.leaf));
      expect(await store.messages.getSynchedL1Block()).toBeUndefined();
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
    });

    it('rolls the whole replacement back when the block prune fails', async () => {
      const block = await makeConsumingBlock(1, 6);
      await updater.addProposedBlock(block, InboxMessagePrefixRef.fromPosition(await positionAt(6)));
      const failure = new Error('prune failed');
      jest.spyOn(store.blocks, 'removeBlocksAfter').mockRejectedValueOnce(failure);

      await expect(
        updater.replaceMessageSuffixAndPruneProposedBlocks({
          firstDivergentIndex: 4n,
          expectedPrefix: await positionAt(4),
          messages: await replacementFrom(4, 1),
          syncState,
        }),
      ).rejects.toBe(failure);

      expect(await storedLeaves()).toEqual(messages.map(m => m.leaf));
      expect(await store.messages.getSynchedL1Block()).toBeUndefined();
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
    });

    it('evicts the proposed checkpoint of pruned blocks so it can no longer be promoted', async () => {
      const block = await makeConsumingBlock(1, 6);
      await updater.addProposedBlock(block, InboxMessagePrefixRef.fromPosition(await positionAt(6)));
      await store.blocks.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      });
      const proposed = (await store.blocks.getLastProposedCheckpoint())!;

      await updater.replaceMessageSuffixAndPruneProposedBlocks({
        firstDivergentIndex: 5n,
        expectedPrefix: await positionAt(5),
        messages: await replacementFrom(5, 1),
        syncState,
      });

      expect(await store.blocks.getLastProposedCheckpoint()).toBeUndefined();
      await expect(
        store.blocks.promoteProposedToCheckpointed(
          CheckpointNumber(1),
          makeL1PublishedData(10),
          [],
          proposed.archive.root,
        ),
      ).rejects.toThrow(NoProposedCheckpointToPromoteError);
    });

    it('flags a divergence below the checkpointed tip and leaves checkpointed blocks in place', async () => {
      const block1 = await makeConsumingBlock(1, 3);
      await updater.addCheckpoints([makePublishedCheckpoint(makeCheckpoint([block1]), 10)]);
      const block2 = await makeConsumingBlock(2, 6, block1);
      block2.checkpointNumber = CheckpointNumber(2);
      block2.indexWithinCheckpoint = IndexWithinCheckpoint(0);
      await updater.addProposedBlock(block2, InboxMessagePrefixRef.fromPosition(await positionAt(6)));

      const result = await updater.replaceMessageSuffixAndPruneProposedBlocks({
        firstDivergentIndex: 2n,
        expectedPrefix: await positionAt(2),
        messages: await replacementFrom(2, 1),
        syncState,
      });

      expect(result.checkpointedTipAffected).toBe(true);
      expect(result.prunedBlocks.map(b => b.number)).toEqual([2]);
      expect(await store.blocks.getBlock({ number: BlockNumber(1) })).toBeDefined();
      expect(await store.blocks.getCheckpointedL2BlockNumber()).toBe(1);
      expect(await storedLeaves()).toHaveLength(3);
    });

    it('treats an empty replacement as a truncation', async () => {
      const block = await makeConsumingBlock(1, 4);
      await updater.addProposedBlock(block, InboxMessagePrefixRef.fromPosition(await positionAt(4)));

      const result = await updater.replaceMessageSuffixAndPruneProposedBlocks({
        firstDivergentIndex: 3n,
        expectedPrefix: await positionAt(3),
        messages: [],
        syncState,
      });

      expect(await storedLeaves()).toEqual(messages.slice(0, 3).map(m => m.leaf));
      expect(result.prunedBlocks.map(b => b.number)).toEqual([1]);
      expect(await store.messages.getSynchedL1Block()).toEqual(syncState.l1Block);
    });
  });
});
