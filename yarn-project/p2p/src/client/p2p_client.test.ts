import { MockL2BlockSource } from '@aztec/archiver/test';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryFastUntil } from '@aztec/foundation/retry';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2Block } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PConfig } from '../config.js';
import type { P2PService } from '../index.js';
import { type AttestationPool, createTestAttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';
import { ReqRespSubProtocol } from '../services/reqresp/interface.js';
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
    p2pService.sendBatchRequest.mockResolvedValue([]);

    l1Constants = EmptyL1RollupConstants;
    txCollection = mock<TxCollection>();
    txCollection.getConstants.mockReturnValue(l1Constants);

    epochCache = mock<EpochCacheInterface>();
    epochCache.getCurrentAndNextSlot.mockReturnValue({ currentSlot: SlotNumber(0), nextSlot: SlotNumber(1) });

    attestationPool = await createTestAttestationPool();

    blockSource = new MockL2BlockSource();
    await blockSource.createBlocks(100);

    mempools = { txPool, attestationPool };
    kvStore = await openTmpStore('test');
    client = createClient();
  });

  const createClient = (config: Partial<P2PConfig> = {}) =>
    new P2PClient(
      P2PClientType.Full,
      kvStore,
      blockSource,
      mempools,
      p2pService,
      txCollection,
      undefined,
      epochCache,
      config,
    );

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

    const client2 = createClient();
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

  it('request transactions handles missing items', async () => {
    const mockTx1 = await mockTx();
    const mockTx2 = await mockTx();
    const mockTx3 = await mockTx();

    // None of the txs are in the pool
    txPool.getTxByHash.mockResolvedValue(undefined);

    // P2P service will not return tx2
    p2pService.sendBatchRequest.mockResolvedValue([new TxArray(...[mockTx1, mockTx3])]);

    // Spy on the tx pool addPendingTxs method, it should not be called for the missing tx
    const addTxsSpy = jest.spyOn(txPool, 'addPendingTxs');

    await client.start();

    // We query for all 3 txs via getTxsByHash which internally requests from the network
    const txHashes = await Promise.all([mockTx1.getTxHash(), mockTx2.getTxHash(), mockTx3.getTxHash()]);
    const results = await client.getTxsByHash(txHashes, undefined);

    // We should receive the found transactions (tx2 will be undefined)
    expect(results).toEqual([mockTx1, undefined, mockTx3]);

    // P2P should have been called with the 3 tx hashes (all missing from pool)
    expect(p2pService.sendBatchRequest).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      txHashes.map(hash => new TxHashArray(...[hash])),
      undefined,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    // Retrieved txs should have been added to the pool
    expect(addTxsSpy).toHaveBeenCalledTimes(1);
    expect(addTxsSpy).toHaveBeenCalledWith([mockTx1, mockTx3]);

    await client.stop();
  });

  it('getTxsByHash handles missing items', async () => {
    // We expect the node to fetch this item from their local p2p pool
    const txInMempool = await mockTx();
    // We expect this transaction to be requested from the network
    const txToBeRequested = await mockTx();
    // We expect this transaction to not be found
    const txToNotBeFound = await mockTx();

    txPool.getTxByHash.mockImplementation(txHash =>
      Promise.resolve(txHash === txInMempool.getTxHash() ? txInMempool : undefined),
    );

    const addTxsSpy = jest.spyOn(txPool, 'addPendingTxs');

    p2pService.sendBatchRequest.mockResolvedValue([new TxArray(...[txToBeRequested])]);

    await client.start();

    const query = await Promise.all([txInMempool.getTxHash(), txToBeRequested.getTxHash(), txToNotBeFound.getTxHash()]);
    const results = await client.getTxsByHash(query, undefined);

    // We should return the resolved transactions (txToNotBeFound is undefined)
    expect(results).toEqual([txInMempool, txToBeRequested, undefined]);
    // We should add the found requested transactions to the pool
    expect(addTxsSpy).toHaveBeenCalledWith([txToBeRequested]);
    // The p2p service should have been called to request the missing txs
    expect(p2pService.sendBatchRequest).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      expect.anything(),
      undefined,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
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
    it('calls handlePrunedBlocks when chain is pruned', async () => {
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // Prune the chain back to block 90
      blockSource.removeBlocks(10);
      await client.sync();

      // Verify handlePrunedBlocks is called with the correct block ID
      expect(txPool.handlePrunedBlocks).toHaveBeenCalledWith({
        number: BlockNumber(90),
        hash: expect.any(String),
      });
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
      const block = await L2Block.random(BlockNumber(101), { txsPerBlock: 3 });
      // Compute the block hash since it gets cached when the p2p client logs it
      await block.hash();

      txPool.hasTxs.mockResolvedValue([true, false, true]);
      blockSource.addProposedBlocks([block]);
      await client.sync();

      expect(txCollection.startCollecting).toHaveBeenCalledTimes(1);
      const [actualBlock, actualTxHashes] = txCollection.startCollecting.mock.calls[0];
      expect(actualBlock.number).toEqual(block.number);
      expect(await actualBlock.hash()).toEqual(await block.hash());
      expect(actualTxHashes).toEqual([block.body.txEffects[1].txHash]);
    });
  });
});
