import { MockL2BlockSource } from '@aztec/archiver/test';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryFastUntil } from '@aztec/foundation/retry';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2Block } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { mockTx } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PConfig } from '../config.js';
import type { P2PService } from '../index.js';
import { type AttestationPool, createTestAttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';
import type { TxCollection } from '../services/tx_collection/tx_collection.js';
import { P2PClient } from './p2p_client.js';

describe('P2P Client', () => {
  let txPool: MockProxy<TxPoolV2>;
  let attestationPool: AttestationPool;
  let mempools: MemPools;
  let blockSource: MockL2BlockSource;
  let p2pService: MockProxy<P2PService>;
  let kvStore: AztecAsyncKVStore;
  let client: P2PClient;
  let txCollection: MockProxy<TxCollection>;
  let epochCache: MockProxy<EpochCacheInterface>;
  let l1Constants: L1RollupConstants;

  beforeEach(async () => {
    txPool = mock<TxPoolV2>();
    txPool.getPendingTxHashes.mockResolvedValue([]);
    txPool.getMinedTxHashes.mockResolvedValue([]);
    txPool.hasTxs.mockResolvedValue([]);
    txPool.addPendingTxs.mockResolvedValue({ accepted: [], ignored: [], rejected: [] });

    p2pService = mock<P2PService>();

    l1Constants = EmptyL1RollupConstants;
    txCollection = mock<TxCollection>();
    txCollection.getConstants.mockReturnValue(l1Constants);

    epochCache = mock<EpochCacheInterface>();
    epochCache.getCurrentAndNextSlot.mockReturnValue({ currentSlot: SlotNumber(0), nextSlot: SlotNumber(1) });
    epochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot: SlotNumber(0), nextSlot: SlotNumber(1) });
    epochCache.getL1Constants.mockReturnValue(l1Constants);

    attestationPool = await createTestAttestationPool();

    blockSource = new MockL2BlockSource();
    await blockSource.createBlocks(100);

    mempools = { txPool, attestationPool };
    kvStore = await openTmpStore('test');
    client = await createClient();
  });

  const createClient = async (config: Partial<P2PConfig> = {}) => {
    const initialBlockHash = await blockSource.getInitialHeader().hash();
    return new P2PClient(
      kvStore,
      blockSource,
      mempools,
      p2pService,
      txCollection,
      undefined,
      epochCache,
      config,
      undefined,
      undefined,
      undefined,
      initialBlockHash,
    );
  };

  const advanceToProvenBlock = async (blockNumber: BlockNumber) => {
    blockSource.setProvenBlockNumber(blockNumber);
    await retryFastUntil(async () => (await client.getSyncedProvenBlockNum()) >= blockNumber, 'synced');
  };

  const advanceToFinalizedBlock = async (blockNumber: BlockNumber) => {
    blockSource.setFinalizedBlockNumber(blockNumber);
    await retryFastUntil(async () => (await client.getSyncedFinalizedBlockNum()) >= blockNumber, 'synced');
  };

  afterEach(async () => {
    if (client.isReady()) {
      await client.stop();
    }
    await kvStore.close();
  });

  it('can start & stop', async () => {
    expect(client.isReady()).toEqual(false);

    await client.start();
    expect(client.isReady()).toEqual(true);

    await client.stop();
    expect(client.isReady()).toEqual(false);
  });

  describe('Service startup while syncing', () => {
    it('fails to start if the p2p service fails to start', async () => {
      p2pService.start.mockRejectedValue(new Error('ERR_NO_VALID_ADDRESSES'));

      await expect(client.start()).rejects.toThrow('ERR_NO_VALID_ADDRESSES');
    });

    it('completes the startup only after the p2p service has started', async () => {
      const serviceStart = promiseWithResolvers<void>();
      p2pService.start.mockReturnValue(serviceStart.promise);

      let startCompleted = false;
      const startPromise = client.start().then(() => {
        startCompleted = true;
      });

      await retryFastUntil(() => p2pService.start.mock.calls.length > 0 || undefined, 'p2p service start');
      expect(startCompleted).toBe(false);

      serviceStart.resolve();
      await startPromise;
      expect(startCompleted).toBe(true);
    });
  });

  it('adds txs to pool and propagates it', async () => {
    await client.start();
    const tx1 = await mockTx();
    const tx2 = await mockTx();

    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [tx1.getTxHash()], ignored: [], rejected: [] });
    await client.sendTx(tx1);
    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [tx2.getTxHash()], ignored: [], rejected: [] });
    await client.sendTx(tx2);

    expect(txPool.addPendingTxs).toHaveBeenCalledTimes(2);
    expect(p2pService.propagate).toHaveBeenCalledTimes(2);

    await client.stop();
  });

  it('does not propagate tx if it already existed', async () => {
    await client.start();
    const tx1 = await mockTx();

    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [tx1.getTxHash()], ignored: [], rejected: [] });
    await client.sendTx(tx1);
    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [], ignored: [tx1.getTxHash()], rejected: [] });
    await client.sendTx(tx1);

    expect(txPool.addPendingTxs).toHaveBeenCalledTimes(2);
    expect(p2pService.propagate).toHaveBeenCalledTimes(1);

    await client.stop();
  });

  it('throws TxPoolError with structured reason when pool rejects tx', async () => {
    await client.start();
    const tx1 = await mockTx();
    const txHashStr = tx1.getTxHash().toString();
    const errors = new Map();
    errors.set(txHashStr, {
      code: 'LOW_PRIORITY_FEE',
      message: 'Tx does not meet minimum priority fee',
      minimumPriorityFee: 101n,
      txPriorityFee: 50n,
    });
    txPool.addPendingTxs.mockResolvedValueOnce({
      accepted: [],
      ignored: [tx1.getTxHash()],
      rejected: [],
      errors,
    });

    await expect(client.sendTx(tx1)).rejects.toThrow('Tx does not meet minimum priority fee');
    expect(p2pService.propagate).not.toHaveBeenCalled();
    await client.stop();
  });

  it('rejects txs after being stopped', async () => {
    await client.start();
    const tx1 = await mockTx();
    const tx2 = await mockTx();
    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [tx1.getTxHash()], ignored: [], rejected: [] });
    await client.sendTx(tx1);
    txPool.addPendingTxs.mockResolvedValueOnce({ accepted: [tx2.getTxHash()], ignored: [], rejected: [] });
    await client.sendTx(tx2);

    expect(txPool.addPendingTxs).toHaveBeenCalledTimes(2);
    await client.stop();
    const tx3 = await mockTx();
    await expect(client.sendTx(tx3)).rejects.toThrow();
    expect(txPool.addPendingTxs).toHaveBeenCalledTimes(2);
  });

  it('restores the previous block number it was at', async () => {
    await client.start();
    const synchedBlock = await client.getSyncedLatestBlockNum();
    await client.stop();

    const client2 = await createClient();
    await expect(client2.getSyncedLatestBlockNum()).resolves.toEqual(synchedBlock);
  });

  it('deletes txs once block is finalized', async () => {
    blockSource.setProvenBlockNumber(0);
    await client.start();
    expect(txPool.handleFinalizedBlock).not.toHaveBeenCalled();

    await advanceToProvenBlock(BlockNumber(5));
    expect(txPool.handleFinalizedBlock).not.toHaveBeenCalled();

    await advanceToFinalizedBlock(BlockNumber(5));
    expect(txPool.handleFinalizedBlock).toHaveBeenCalledTimes(1);
    txPool.handleFinalizedBlock.mockClear();

    await advanceToFinalizedBlock(BlockNumber(8));
    expect(txPool.handleFinalizedBlock).toHaveBeenCalledTimes(1);
    await client.stop();
  });

  it('getPendingTxs respects pagination', async () => {
    const txs = await timesAsync(20, i => mockTx(i));
    txPool.getPendingTxHashes.mockResolvedValue(await Promise.all(txs.map(tx => tx.getTxHash())));
    txPool.getTxByHash.mockImplementation(hash => Promise.resolve(txs.find(tx => hash.equals(tx.getTxHash()))));

    const firstPage = await client.getPendingTxs(2);
    expect(firstPage).toEqual(txs.slice(0, 2));
    const secondPage = await client.getPendingTxs(2, firstPage.at(-1)!.getTxHash());
    expect(secondPage).toEqual(txs.slice(2, 4));
    const thirdPage = await client.getPendingTxs(10, secondPage.at(-1)!.getTxHash());
    expect(thirdPage).toEqual(txs.slice(4, 14));
    const lastPage = await client.getPendingTxs(undefined, thirdPage.at(-1)!.getTxHash());
    expect(lastPage).toEqual(txs.slice(14));

    await expect(client.getPendingTxs(1, lastPage.at(-1)!.getTxHash())).resolves.toEqual([]);
    await expect(client.getPendingTxs()).resolves.toEqual(txs);

    await expect(client.getPendingTxs(0)).rejects.toThrow();
    await expect(client.getPendingTxs(-1)).rejects.toThrow();

    await expect(client.getPendingTxs(10, TxHash.random())).resolves.toEqual([]);
  });

  describe('Chain prunes', () => {
    it('detects checkpoint prune when checkpoint number stays the same', async () => {
      client = await createClient({ txPoolDeleteTxsAfterReorg: true });
      blockSource.setProvenBlockNumber(0);
      // Only checkpoint up to block 90 — blocks 91-100 are proposed but not checkpointed
      blockSource.setCheckpointedBlockNumber(90);
      await client.start();

      // Prune 10 blocks (91-100): checkpoint number stays at 90, so this is a checkpoint prune
      blockSource.removeBlocks(10);
      await client.sync();

      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith(
        { number: BlockNumber(90), hash: expect.any(String) },
        { deleteAllTxs: false },
      );
      await client.stop();
    });

    it('detects checkpoint prune when checkpoint number increases by one', async () => {
      client = await createClient({ txPoolDeleteTxsAfterReorg: true });
      blockSource.setProvenBlockNumber(0);
      blockSource.setCheckpointedBlockNumber(100);
      await client.start();

      // Propose block 101 and sync it
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101))]);
      await client.sync();

      // Replace block 101 with a different block and checkpoint it
      blockSource.removeBlocks(1);
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101))]);
      blockSource.setCheckpointedBlockNumber(101);
      await client.sync();

      // Checkpoint advanced from 100 to 101: not an epoch prune
      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith(
        { number: BlockNumber(100), hash: expect.any(String) },
        { deleteAllTxs: false },
      );
      await client.stop();
    });

    it('detects checkpoint prune when checkpoint number decreases by one', async () => {
      client = await createClient({ txPoolDeleteTxsAfterReorg: true });
      blockSource.setProvenBlockNumber(0);
      // Checkpoint all 100 blocks — client stores checkpoint number 100
      blockSource.setCheckpointedBlockNumber(100);
      await client.start();

      // Prune 1 block: checkpoint number drops by 1, so checkpoint prune
      blockSource.removeBlocks(1);
      await client.sync();

      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith(
        { number: BlockNumber(99), hash: expect.any(String) },
        { deleteAllTxs: false },
      );
      await client.stop();
    });

    it('detects epoch prune when checkpoint number decreases by more than 1', async () => {
      client = await createClient({ txPoolDeleteTxsAfterReorg: true });
      blockSource.setProvenBlockNumber(0);
      // Checkpoint all 100 blocks — client stores checkpoint number 100
      blockSource.setCheckpointedBlockNumber(100);
      await client.start();

      // Prune 2 blocks (99-100): checkpoint number drops from 100 to 98, so this is an epoch prune
      blockSource.removeBlocks(2);
      await client.sync();

      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith(
        { number: BlockNumber(98), hash: expect.any(String) },
        { deleteAllTxs: true },
      );
      await client.stop();
    });

    it('does not delete all txs on epoch prune when txPoolDeleteTxsAfterReorg is disabled', async () => {
      // Default config has txPoolDeleteTxsAfterReorg: false
      blockSource.setProvenBlockNumber(0);
      // Checkpoint all 100 blocks
      blockSource.setCheckpointedBlockNumber(100);
      await client.start();

      // Prune 5 blocks (96-100): epoch prune but flag is off
      blockSource.removeBlocks(5);
      await client.sync();

      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith(
        { number: BlockNumber(95), hash: expect.any(String) },
        { deleteAllTxs: false },
      );
      await client.stop();
    });

    it('moves the tips on a chain reorg', async () => {
      blockSource.setProvenBlockNumber(0);
      // Set checkpointed before starting so blocks are synced as checkpointed
      blockSource.setCheckpointedBlockNumber(100);
      await client.start();

      await advanceToProvenBlock(BlockNumber(90));
      await advanceToFinalizedBlock(BlockNumber(50));

      const anyCheckpoint = { number: expect.any(Number), hash: expect.any(String) };
      await expect(client.getL2Tips()).resolves.toEqual({
        proposed: { number: BlockNumber(100), hash: expect.any(String) },
        checkpointed: { block: { number: BlockNumber(100), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        proven: { block: { number: BlockNumber(90), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        finalized: { block: { number: BlockNumber(50), hash: expect.any(String) }, checkpoint: anyCheckpoint },
      });

      blockSource.removeBlocks(10);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        proposed: { number: BlockNumber(90), hash: expect.any(String) },
        checkpointed: { block: { number: BlockNumber(90), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        proven: { block: { number: BlockNumber(90), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        finalized: { block: { number: BlockNumber(50), hash: expect.any(String) }, checkpoint: anyCheckpoint },
      });

      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(91)), await L2Block.random(BlockNumber(92))]);
      blockSource.setCheckpointedBlockNumber(92);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        proposed: { number: BlockNumber(92), hash: expect.any(String) },
        checkpointed: { block: { number: BlockNumber(92), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        proven: { block: { number: BlockNumber(90), hash: expect.any(String) }, checkpoint: anyCheckpoint },
        finalized: { block: { number: BlockNumber(50), hash: expect.any(String) }, checkpoint: anyCheckpoint },
      });
    });
  });

  describe('Attestation pool pruning', () => {
    it('deletes attestations for finalized blocks', async () => {
      const deleteOlderThanSpy = jest.spyOn(attestationPool, 'deleteOlderThan');

      blockSource.setProvenBlockNumber(0);
      await client.start();
      expect(deleteOlderThanSpy).not.toHaveBeenCalled();

      await advanceToProvenBlock(BlockNumber(10));
      expect(deleteOlderThanSpy).not.toHaveBeenCalled();

      await advanceToFinalizedBlock(BlockNumber(10));
      expect(deleteOlderThanSpy).toHaveBeenCalledTimes(1);
      expect(deleteOlderThanSpy).toHaveBeenCalledWith(SlotNumber(10));

      await advanceToFinalizedBlock(BlockNumber(15));
      expect(deleteOlderThanSpy).toHaveBeenCalledTimes(2);
      expect(deleteOlderThanSpy).toHaveBeenCalledWith(SlotNumber(15));
    });
  });

  describe('Chain events', () => {
    beforeEach(() => {
      // P2P client skips syncing first 100 blocks if tx pool is empty
      txPool.isEmpty.mockResolvedValue(true);
    });

    it('syncs new blocks', async () => {
      await client.start();
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101)), await L2Block.random(BlockNumber(102))]);
      await client.sync();
      expect(await client.getSyncedLatestBlockNum()).toEqual(102);
    });

    it('prepares the pool for the last synced block slot after marking txs mined', async () => {
      await client.start();

      blockSource.addProposedBlocks([
        await L2Block.random(BlockNumber(101), { slotNumber: SlotNumber(150) }),
        await L2Block.random(BlockNumber(102), { slotNumber: SlotNumber(151) }),
      ]);
      await client.sync();

      // Release is driven by the synced block slot, not the wall clock: prepareForSlot is ultimately
      // driven with the last synced block's slot (regardless of how the stream batches the blocks),
      // never reads the epoch cache, and never targets a slot beyond what has synced.
      expect(txPool.prepareForSlot).toHaveBeenLastCalledWith(SlotNumber(151));
      const preparedSlots = txPool.prepareForSlot.mock.calls.map(([slot]) => Number(slot));
      expect(Math.max(...preparedSlots)).toBe(151);
      expect(epochCache.getCurrentAndNextSlot).not.toHaveBeenCalled();
      // Mined-marking runs before the matching-slot release within the handler.
      expect(txPool.handleMinedBlock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
        txPool.prepareForSlot.mock.invocationCallOrder.at(-1)!,
      );
    });

    it('does not re-prepare for a slot that does not advance', async () => {
      await client.start();

      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101), { slotNumber: SlotNumber(150) })]);
      await client.sync();
      const callsAfterFirst = txPool.prepareForSlot.mock.calls.length;
      expect(txPool.prepareForSlot).toHaveBeenLastCalledWith(SlotNumber(150));

      // A later block at an earlier slot must not advance the prepared-for slot
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(102), { slotNumber: SlotNumber(149) })]);
      await client.sync();
      expect(txPool.prepareForSlot.mock.calls.length).toBe(callsAfterFirst);
      expect(txPool.prepareForSlot).not.toHaveBeenCalledWith(SlotNumber(149));
    });

    it('handles proven and finalized chain behind starting point', async () => {
      blockSource.setProvenBlockNumber(0);
      blockSource.setFinalizedBlockNumber(0);

      await client.start();

      const provenBlock = await client.getSyncedProvenBlockNum();
      const finalizedBlock = await client.getSyncedFinalizedBlockNum();

      expect(provenBlock).toEqual(0);
      expect(finalizedBlock).toEqual(0);

      await advanceToProvenBlock(BlockNumber(10));
      await advanceToFinalizedBlock(BlockNumber(5));

      expect(await client.getSyncedProvenBlockNum()).toEqual(10);
      expect(await client.getSyncedFinalizedBlockNum()).toEqual(5);
    });

    it('stops tx collection for pruned blocks', async () => {
      await client.start();
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101)), await L2Block.random(BlockNumber(102))]);
      await client.sync();

      blockSource.removeBlocks(1);
      await client.sync();
      expect(txCollection.stopCollectingForBlocksAfter).toHaveBeenCalledWith(BlockNumber(101));
    });

    it('stops tx collection for proven blocks', async () => {
      await client.start();
      blockSource.addProposedBlocks([await L2Block.random(BlockNumber(101)), await L2Block.random(BlockNumber(102))]);
      await client.sync();

      await advanceToProvenBlock(BlockNumber(101));
      expect(txCollection.stopCollectingForBlocksUpTo).toHaveBeenCalledWith(BlockNumber(101));
    });

    it('triggers tx collection for missing txs from mined blocks', async () => {
      await client.start();
      // Drain any initial background sync that processes the initial blocks (1-100),
      // which may call startCollecting depending on timing.
      await client.sync();

      const block = await L2Block.random(BlockNumber(101), { txsPerBlock: 3 });
      // Compute the block hash since it gets cached when the p2p client logs it
      await block.hash();

      txPool.hasTxs.mockResolvedValue([true, false, true]);
      blockSource.addProposedBlocks([block]);
      txCollection.collectFastForBlock.mockClear();
      await client.sync();

      expect(txCollection.collectFastForBlock).toHaveBeenCalledTimes(1);
      const [actualBlock, actualTxHashes] = txCollection.collectFastForBlock.mock.calls[0];
      expect(actualBlock.number).toEqual(block.number);
      expect(await actualBlock.hash()).toEqual(await block.hash());
      expect(actualTxHashes).toEqual([block.body.txEffects[1].txHash]);
    });
  });
});
