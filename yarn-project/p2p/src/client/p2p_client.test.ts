import { MockL2BlockSource } from '@aztec/archiver/test';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2Block } from '@aztec/stdlib/block';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { InMemoryAttestationPool, type P2PService } from '../index.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../services/reqresp/interface.js';
import { P2PClient } from './p2p_client.js';

describe('P2P Client', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: AttestationPool;
  let mempools: MemPools;
  let blockSource: MockL2BlockSource;
  let p2pService: MockProxy<P2PService>;
  let kvStore: AztecAsyncKVStore;
  let client: P2PClient;

  beforeEach(async () => {
    txPool = mock<TxPool>();
    txPool.getAllTxs.mockResolvedValue([]);
    txPool.getPendingTxHashes.mockResolvedValue([]);
    txPool.getMinedTxHashes.mockResolvedValue([]);
    txPool.getAllTxHashes.mockResolvedValue([]);
    txPool.hasTxs.mockResolvedValue([]);
    txPool.addTxs.mockResolvedValue(1);

    p2pService = mock<P2PService>();
    p2pService.sendBatchRequest.mockResolvedValue([]);

    attestationPool = new InMemoryAttestationPool();

    blockSource = new MockL2BlockSource();
    await blockSource.createBlocks(100);

    mempools = {
      txPool,
      attestationPool,
    };

    kvStore = await openTmpStore('test');
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService);
  });

  const advanceToProvenBlock = async (blockNumber: number) => {
    blockSource.setProvenBlockNumber(blockNumber);
    await retryUntil(async () => (await client.getSyncedProvenBlockNum()) >= blockNumber, 'synced', 10, 0.1);
  };

  const advanceToFinalizedBlock = async (blockNumber: number) => {
    blockSource.setFinalizedBlockNumber(blockNumber);
    await retryUntil(async () => (await client.getSyncedFinalizedBlockNum()) >= blockNumber, 'synced', 10, 0.1);
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

    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    expect(p2pService.propagate).toHaveBeenCalledTimes(2);

    await client.stop();
  });

  it('adds txs to pool and dont propagate it if it already existed', async () => {
    await client.start();
    const tx1 = await mockTx();

    await client.sendTx(tx1);
    txPool.addTxs.mockResolvedValueOnce(0);
    await client.sendTx(tx1);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    expect(p2pService.propagate).toHaveBeenCalledTimes(1);

    await client.stop();
  });

  it('rejects txs after being stopped', async () => {
    await client.start();
    const tx1 = await mockTx();
    const tx2 = await mockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    await client.stop();
    const tx3 = await mockTx();
    await expect(client.sendTx(tx3)).rejects.toThrow();
    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });

  it('restores the previous block number it was at', async () => {
    await client.start();
    const synchedBlock = await client.getSyncedLatestBlockNum();
    await client.stop();

    const client2 = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService);
    await expect(client2.getSyncedLatestBlockNum()).resolves.toEqual(synchedBlock);
  });

  it('deletes txs once block is finalized', async () => {
    blockSource.setProvenBlockNumber(0);
    await client.start();
    expect(txPool.deleteTxs).not.toHaveBeenCalled();

    await advanceToProvenBlock(5);
    expect(txPool.deleteTxs).not.toHaveBeenCalled();

    await advanceToFinalizedBlock(5);
    expect(txPool.deleteTxs).toHaveBeenCalledTimes(5);

    await advanceToFinalizedBlock(8);
    expect(txPool.deleteTxs).toHaveBeenCalledTimes(8);
    await client.stop();
  });

  it('request transactions handles missing items', async () => {
    const mockTx1 = await mockTx();
    const mockTx2 = await mockTx();
    const mockTx3 = await mockTx();

    // P2P service will not return tx2
    p2pService.sendBatchRequest.mockResolvedValue([mockTx1, undefined, mockTx3]);

    // Spy on the tx pool addTxs method, it should not be called for the missing tx
    const addTxsSpy = jest.spyOn(txPool, 'addTxs');

    // We query for all 3 txs
    const query = await Promise.all([mockTx1.getTxHash(), mockTx2.getTxHash(), mockTx3.getTxHash()]);
    const results = await client.requestTxsByHash(query, undefined);

    // We should receive the found transactions
    expect(results).toEqual([mockTx1, undefined, mockTx3]);

    // P2P should have been called with the 3 tx hashes
    expect(p2pService.sendBatchRequest).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      query,
      undefined,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    // Retrieved txs should have been added to the pool
    expect(addTxsSpy).toHaveBeenCalledTimes(1);
    expect(addTxsSpy).toHaveBeenCalledWith([mockTx1, mockTx3]);
  });

  it('getTxsByHash handles missing items', async () => {
    // We expect the node to fetch this item from their local p2p pool
    const txInMempool = await mockTx();
    // We expect this transaction to be requested from the network
    const txToBeRequested = await mockTx();
    // We expect this transaction to not be found
    const txToNotBeFound = await mockTx();

    txPool.getTxByHash.mockImplementation(async txHash => {
      if (txHash === (await txInMempool.getTxHash())) {
        return txInMempool;
      }
      return undefined;
    });

    const addTxsSpy = jest.spyOn(txPool, 'addTxs');
    const requestTxsSpy = jest.spyOn(client, 'requestTxsByHash');

    p2pService.sendBatchRequest.mockResolvedValue([txToBeRequested, undefined]);

    await client.start();

    const query = await Promise.all([txInMempool.getTxHash(), txToBeRequested.getTxHash(), txToNotBeFound.getTxHash()]);
    const results = await client.getTxsByHash(query, undefined);

    // We should return the resolved transactions
    expect(results).toEqual([txInMempool, txToBeRequested]);
    // We should add the found requested transactions to the pool
    expect(addTxsSpy).toHaveBeenCalledWith([txToBeRequested]);
    // We should request the missing transactions from the network, but only find one of them
    expect(requestTxsSpy).toHaveBeenCalledWith(
      [await txToBeRequested.getTxHash(), await txToNotBeFound.getTxHash()],
      undefined,
    );
  });

  it('getPendingTxs respects pagination', async () => {
    const txs = await timesAsync(20, i => mockTx(i));
    txPool.getPendingTxHashes.mockResolvedValue(await Promise.all(txs.map(tx => tx.getTxHash())));
    txPool.getTxByHash.mockImplementation(async hash => {
      for (const tx of txs) {
        if (hash.equals(await tx.getTxHash())) {
          return tx;
        }
      }
    });

    const firstPage = await client.getPendingTxs(2);
    expect(firstPage).toEqual(txs.slice(0, 2));
    const secondPage = await client.getPendingTxs(2, await firstPage.at(-1)!.getTxHash());
    expect(secondPage).toEqual(txs.slice(2, 4));
    const thirdPage = await client.getPendingTxs(10, await secondPage.at(-1)!.getTxHash());
    expect(thirdPage).toEqual(txs.slice(4, 14));
    const lastPage = await client.getPendingTxs(undefined, await thirdPage.at(-1)!.getTxHash());
    expect(lastPage).toEqual(txs.slice(14));

    await expect(client.getPendingTxs(1, await lastPage.at(-1)!.getTxHash())).resolves.toEqual([]);
    await expect(client.getPendingTxs()).resolves.toEqual(txs);

    await expect(client.getPendingTxs(0)).rejects.toThrow();
    await expect(client.getPendingTxs(-1)).rejects.toThrow();

    await expect(client.getPendingTxs(10, TxHash.random())).resolves.toEqual([]);
  });

  it('getTxs respects pagination', async () => {
    const allTxs = await timesAsync(50, i => mockTx(i));
    const minedTxs = allTxs.slice(0, Math.ceil(allTxs.length / 3));
    const pendingTxs = allTxs.slice(Math.ceil(allTxs.length / 3));

    txPool.getMinedTxHashes.mockResolvedValue(await Promise.all(minedTxs.map(async tx => [await tx.getTxHash(), 42])));
    txPool.getPendingTxHashes.mockResolvedValue(await Promise.all(pendingTxs.map(tx => tx.getTxHash())));

    txPool.getAllTxs.mockResolvedValue(allTxs);
    txPool.getAllTxHashes.mockResolvedValue(await Promise.all(allTxs.map(tx => tx.getTxHash())));

    txPool.getTxByHash.mockImplementation(async hash => {
      for (const tx of allTxs) {
        if (hash.equals(await tx.getTxHash())) {
          return tx;
        }
      }
    });

    for (const [txType, txs] of [
      ['all', allTxs],
      ['pending', pendingTxs],
      ['mined', minedTxs],
    ] as const) {
      const firstPage = await client.getTxs(txType, 2);
      expect(firstPage).toEqual(txs.slice(0, 2));
      const secondPage = await client.getTxs(txType, 2, await firstPage.at(-1)!.getTxHash());
      expect(secondPage).toEqual(txs.slice(2, 4));
      const thirdPage = await client.getTxs(txType, 10, await secondPage.at(-1)!.getTxHash());
      expect(thirdPage).toEqual(txs.slice(4, 14));
      const lastPage = await client.getTxs(txType, undefined, await thirdPage.at(-1)!.getTxHash());
      expect(lastPage).toEqual(txs.slice(14));

      await expect(client.getTxs(txType, 1, await lastPage.at(-1)!.getTxHash())).resolves.toEqual([]);
      await expect(client.getTxs(txType)).resolves.toEqual(txs);

      await expect(client.getTxs(txType, 0)).rejects.toThrow();
      await expect(client.getTxs(txType, -1)).rejects.toThrow();

      await expect(client.getTxs(txType, 10, TxHash.random())).resolves.toEqual([]);
    }
  });

  describe('Chain prunes', () => {
    it('deletes transactions mined in pruned blocks', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService);
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // Create two transactions:
      // 1. A transaction mined in block 95 (which will be pruned)
      // 2. A transaction mined in block 90 (which will remain)
      const txMinedInPrunedBlock = await mockTx();
      const txMinedInKeptBlock = await mockTx();

      // Mock the mined transactions
      txPool.getMinedTxHashes.mockResolvedValue([
        [await txMinedInPrunedBlock.getTxHash(), 95],
        [await txMinedInKeptBlock.getTxHash(), 90],
      ]);

      txPool.getAllTxs.mockResolvedValue([txMinedInPrunedBlock, txMinedInKeptBlock]);

      // Prune the chain back to block 90
      blockSource.removeBlocks(10);
      await client.sync();

      // Verify only the transaction mined in the pruned block is deleted
      expect(txPool.deleteTxs).toHaveBeenCalledWith([await txMinedInPrunedBlock.getTxHash()]);
      await client.stop();
    });

    it('moves the tips on a chain reorg', async () => {
      blockSource.setProvenBlockNumber(0);
      await client.start();

      await advanceToProvenBlock(90);
      await advanceToFinalizedBlock(50);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 100, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 50, hash: expect.any(String) },
      });

      blockSource.removeBlocks(10);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 90, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 50, hash: expect.any(String) },
      });

      blockSource.addBlocks([await L2Block.random(91), await L2Block.random(92)]);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 92, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 50, hash: expect.any(String) },
      });
    });

    it('deletes txs created from a pruned block', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService);
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add two txs to the pool. One build against block 90, one against block 95
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodTx = await mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = 90;

      const badTx = await mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = 95;

      txPool.getAllTxs.mockResolvedValue([goodTx, badTx]);

      blockSource.removeBlocks(10);
      await client.sync();
      expect(txPool.deleteTxs).toHaveBeenCalledWith([await badTx.getTxHash()]);
      await client.stop();
    });

    // NOTE: skipping as we currently delete all mined txs within the epoch when pruning
    // TODO: bring back once fixed: #13770
    it.skip('moves mined and valid txs back to the pending set', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService);
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add three txs to the pool built against different blocks
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodButOldTx = await mockTx();
      goodButOldTx.data.constants.historicalHeader.globalVariables.blockNumber = 89;

      const goodTx = await mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = 90;

      const badTx = await mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = 95;

      txPool.getAllTxs.mockResolvedValue([goodButOldTx, goodTx, badTx]);
      txPool.getMinedTxHashes.mockResolvedValue([
        [await goodButOldTx.getTxHash(), 90],
        [await goodTx.getTxHash(), 91],
      ]);

      blockSource.removeBlocks(10);
      await client.sync();
      expect(txPool.deleteTxs).toHaveBeenCalledWith([await badTx.getTxHash()]);
      expect(txPool.markMinedAsPending).toHaveBeenCalledWith([await goodTx.getTxHash()]);
      await client.stop();
    });
  });

  describe('Attestation pool pruning', () => {
    it('deletes attestations for finalized blocks', async () => {
      const deleteAttestationsOlderThanSpy = jest.spyOn(attestationPool, 'deleteAttestationsOlderThan');

      blockSource.setProvenBlockNumber(0);
      await client.start();
      expect(deleteAttestationsOlderThanSpy).not.toHaveBeenCalled();

      await advanceToProvenBlock(10);
      expect(deleteAttestationsOlderThanSpy).not.toHaveBeenCalled();

      await advanceToFinalizedBlock(10);
      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledTimes(1);
      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledWith(10n);

      await advanceToFinalizedBlock(15);
      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledTimes(2);
      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledWith(15n);
    });
  });

  describe('Chain events', () => {
    beforeEach(() => {
      // P2P client skips syncing first 100 blocks if tx pool is empty
      txPool.isEmpty.mockResolvedValue(true);
    });

    it('syncs new blocks', async () => {
      await client.start();
      blockSource.addBlocks([await L2Block.random(101), await L2Block.random(102)]);
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

      await advanceToProvenBlock(10);
      await advanceToFinalizedBlock(5);

      expect(await client.getSyncedProvenBlockNum()).toEqual(10);
      expect(await client.getSyncedFinalizedBlockNum()).toEqual(5);
    });
  });
});
