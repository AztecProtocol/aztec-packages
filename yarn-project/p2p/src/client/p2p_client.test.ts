import { MockL2BlockSource } from '@aztec/archiver/test';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CommitteeAttestation, L2Block, randomPublishedL2Block } from '@aztec/stdlib/block';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { InMemoryAttestationPool, type P2PService } from '../index.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { P2PClient } from './p2p_client.js';

describe('In-Memory P2P Client', () => {
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

  const advanceToProvenBlock = async (getProvenBlockNumber: number) => {
    blockSource.setProvenBlockNumber(getProvenBlockNumber);
    await retryUntil(async () => (await client.getSyncedProvenBlockNum()) >= getProvenBlockNumber, 'synced', 10, 0.1);
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

  it('adds txs to pool', async () => {
    await client.start();
    const tx1 = await mockTx();
    const tx2 = await mockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
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

  it('deletes txs once block is proven', async () => {
    blockSource.setProvenBlockNumber(0);
    await client.start();
    expect(txPool.deleteTxs).not.toHaveBeenCalled();

    await advanceToProvenBlock(5);
    expect(txPool.deleteTxs).toHaveBeenCalledTimes(5);
    await client.stop();
  });

  it('deletes txs after waiting the set number of blocks', async () => {
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, {
      keepProvenTxsInPoolFor: 10,
    });
    blockSource.setProvenBlockNumber(0);
    await client.start();
    expect(txPool.deleteTxs).not.toHaveBeenCalled();

    await advanceToProvenBlock(5);
    expect(txPool.deleteTxs).not.toHaveBeenCalled();

    await advanceToProvenBlock(12);
    expect(txPool.deleteTxs).toHaveBeenCalledTimes(2);

    await advanceToProvenBlock(20);
    expect(txPool.deleteTxs).toHaveBeenCalledTimes(10);
    await client.stop();
  });

  it('request transactions handles missing items', async () => {
    // Mock a batch response that returns undefined items
    const mockTx1 = await mockTx();
    const mockTx2 = await mockTx();
    txPool.hasTxs.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => true)));
    p2pService.sendBatchRequest.mockResolvedValue([mockTx1, undefined, mockTx2]);

    // Spy on the tx pool addTxs method, it should not be called for the missing tx
    const addTxsSpy = jest.spyOn(txPool, 'addTxs');

    await client.start();

    const missingTxHash = (await mockTx()).getTxHash();
    const query = await Promise.all([mockTx1.getTxHash(), missingTxHash, mockTx2.getTxHash()]);
    const results = await client.requestTxsByHash(query);

    expect(results).toEqual([mockTx1, undefined, mockTx2]);

    expect(addTxsSpy).toHaveBeenCalledTimes(1);
    expect(addTxsSpy).toHaveBeenCalledWith([mockTx1, mockTx2]);
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
    const results = await client.getTxsByHash(query);

    // We should return the resolved transactions
    expect(results).toEqual([txInMempool, txToBeRequested]);
    // We should add the found requested transactions to the pool
    expect(addTxsSpy).toHaveBeenCalledWith([txToBeRequested]);
    // We should request the missing transactions from the network, but only find one of them
    expect(requestTxsSpy).toHaveBeenCalledWith([await txToBeRequested.getTxHash(), await txToNotBeFound.getTxHash()]);
  });

  describe('Chain prunes', () => {
    it('deletes transactions mined in pruned blocks', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, {
        keepProvenTxsInPoolFor: 10,
      });
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

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 100, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.removeBlocks(10);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 90, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.addBlocks([await L2Block.random(91), await L2Block.random(92)]);

      await client.sync();

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 92, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });
    });

    it('deletes txs created from a pruned block', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, {
        keepProvenTxsInPoolFor: 10,
      });
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add two txs to the pool. One build against block 90, one against block 95
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodTx = await mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(90);

      const badTx = await mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(95);

      txPool.getAllTxs.mockResolvedValue([goodTx, badTx]);

      blockSource.removeBlocks(10);
      await client.sync();
      expect(txPool.deleteTxs).toHaveBeenCalledWith([await badTx.getTxHash()]);
      await client.stop();
    });

    // NOTE: skipping as we currently delete all mined txs within the epoch when pruning
    // TODO: bring back once fixed: #13770
    it.skip('moves mined and valid txs back to the pending set', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, {
        keepProvenTxsInPoolFor: 10,
      });
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add three txs to the pool built against different blocks
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodButOldTx = await mockTx();
      goodButOldTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(89);

      const goodTx = await mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(90);

      const badTx = await mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(95);

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
    it('deletes attestations older than the number of slots we want to keep in the pool', async () => {
      const advanceToProvenBlockNumber = 20;
      const keepAttestationsInPoolFor = 12;

      const deleteAttestationsOlderThanSpy = jest.spyOn(attestationPool, 'deleteAttestationsOlderThan');

      blockSource.setProvenBlockNumber(0);
      (client as any).config.keepAttestationsInPoolFor = keepAttestationsInPoolFor;
      await client.start();
      expect(deleteAttestationsOlderThanSpy).not.toHaveBeenCalled();

      await advanceToProvenBlock(advanceToProvenBlockNumber);

      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledTimes(1);
      expect(deleteAttestationsOlderThanSpy).toHaveBeenCalledWith(
        BigInt(advanceToProvenBlockNumber - keepAttestationsInPoolFor),
      );
    });
  });
});
