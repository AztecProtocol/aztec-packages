import { MockL2BlockSource } from '@aztec/archiver/test';
import { L2Block, P2PClientType, mockEpochProofQuote, mockTx } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { expect } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type EpochProofQuotePool, type P2PService } from '../index.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { P2PClient } from './p2p_client.js';

describe('In-Memory P2P Client', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochProofQuotePool: MockProxy<EpochProofQuotePool>;
  let mempools: MemPools;
  let blockSource: MockL2BlockSource;
  let p2pService: MockProxy<P2PService>;
  let kvStore: AztecKVStore;
  let client: P2PClient;

  beforeEach(() => {
    txPool = mock<TxPool>();
    txPool.getAllTxs.mockReturnValue([]);
    txPool.getPendingTxHashes.mockReturnValue([]);
    txPool.getMinedTxHashes.mockReturnValue([]);
    txPool.getAllTxHashes.mockReturnValue([]);

    p2pService = mock<P2PService>();

    attestationPool = mock<AttestationPool>();

    epochProofQuotePool = mock<EpochProofQuotePool>();
    epochProofQuotePool.getQuotes.mockReturnValue([]);

    blockSource = new MockL2BlockSource();
    blockSource.createBlocks(100);

    mempools = {
      txPool,
      attestationPool,
      epochProofQuotePool,
    };

    kvStore = openTmpStore();
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 0);
  });

  const advanceToProvenBlock = async (getProvenBlockNumber: number, provenEpochNumber = getProvenBlockNumber) => {
    blockSource.setProvenBlockNumber(getProvenBlockNumber);
    blockSource.setProvenEpochNumber(provenEpochNumber);
    await retryUntil(
      () => Promise.resolve(client.getSyncedProvenBlockNum() >= getProvenBlockNumber),
      'synced',
      10,
      0.1,
    );
  };

  afterEach(async () => {
    if (client.isReady()) {
      await client.stop();
    }
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
    const tx1 = mockTx();
    const tx2 = mockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    await client.stop();
  });

  it('rejects txs after being stopped', async () => {
    await client.start();
    const tx1 = mockTx();
    const tx2 = mockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    await client.stop();
    const tx3 = mockTx();
    await expect(client.sendTx(tx3)).rejects.toThrow();
    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });

  it('restores the previous block number it was at', async () => {
    await client.start();
    await client.stop();

    const client2 = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 0);
    expect(client2.getSyncedLatestBlockNum()).toEqual(client.getSyncedLatestBlockNum());
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
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 10);
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

  it('stores and returns epoch proof quotes', async () => {
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 0);

    blockSource.setProvenEpochNumber(2);
    await client.start();

    const proofQuotes = [
      mockEpochProofQuote(3n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
      mockEpochProofQuote(4n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
    ];

    for (const quote of proofQuotes) {
      await client.addEpochProofQuote(quote);
    }
    expect(epochProofQuotePool.addQuote).toBeCalledTimes(proofQuotes.length);

    for (let i = 0; i < proofQuotes.length; i++) {
      expect(epochProofQuotePool.addQuote).toHaveBeenNthCalledWith(i + 1, proofQuotes[i]);
    }
    expect(epochProofQuotePool.addQuote).toBeCalledTimes(proofQuotes.length);

    await client.getEpochProofQuotes(2n);

    expect(epochProofQuotePool.getQuotes).toBeCalledTimes(1);
    expect(epochProofQuotePool.getQuotes).toBeCalledWith(2n);
  });

  // TODO(#10737) flake cc Maddiaa0
  it.skip('deletes expired proof quotes', async () => {
    client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 0);

    blockSource.setProvenEpochNumber(1);
    blockSource.setProvenBlockNumber(1);
    await client.start();

    const proofQuotes = [
      mockEpochProofQuote(3n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
      mockEpochProofQuote(4n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
    ];

    for (const quote of proofQuotes) {
      client.broadcastEpochProofQuote(quote);
    }

    epochProofQuotePool.deleteQuotesToEpoch.mockReset();

    await advanceToProvenBlock(3, 3);

    expect(epochProofQuotePool.deleteQuotesToEpoch).toBeCalledWith(3n);
  });

  describe('Chain prunes', () => {
    // TODO(#10737) flake cc Maddiaa0
    it.skip('moves the tips on a chain reorg', async () => {
      blockSource.setProvenBlockNumber(0);
      await client.start();

      await advanceToProvenBlock(90);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 100, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.removeBlocks(10);

      // give the client a chance to react to the reorg
      await sleep(100);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 90, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.addBlocks([L2Block.random(91), L2Block.random(92)]);

      // give the client a chance to react to the new blocks
      await sleep(100);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 92, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });
    });

    it('deletes txs created from a pruned block', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 10);
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add two txs to the pool. One build against block 90, one against block 95
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodTx = mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(90);

      const badTx = mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(95);

      txPool.getAllTxs.mockReturnValue([goodTx, badTx]);

      blockSource.removeBlocks(10);
      await sleep(150);
      expect(txPool.deleteTxs).toHaveBeenCalledWith([badTx.getTxHash()]);
      await client.stop();
    });

    it('moves mined and valid txs back to the pending set', async () => {
      client = new P2PClient(P2PClientType.Full, kvStore, blockSource, mempools, p2pService, 10);
      blockSource.setProvenBlockNumber(0);
      await client.start();

      // add three txs to the pool built against different blocks
      // then prune the chain back to block 90
      // only one tx should be deleted
      const goodButOldTx = mockTx();
      goodButOldTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(89);

      const goodTx = mockTx();
      goodTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(90);

      const badTx = mockTx();
      badTx.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(95);

      txPool.getAllTxs.mockReturnValue([goodButOldTx, goodTx, badTx]);
      txPool.getMinedTxHashes.mockReturnValue([
        [goodButOldTx.getTxHash(), 90],
        [goodTx.getTxHash(), 91],
      ]);

      blockSource.removeBlocks(10);
      await sleep(150);
      expect(txPool.deleteTxs).toHaveBeenCalledWith([badTx.getTxHash()]);
      await sleep(150);
      expect(txPool.markMinedAsPending).toHaveBeenCalledWith([goodTx.getTxHash()]);
      await client.stop();
    });
  });

  describe('Attestation pool pruning', () => {
    it('deletes attestations older than the number of slots we want to keep in the pool', async () => {
      const advanceToProvenBlockNumber = 20;
      const keepAttestationsInPoolFor = 12;

      blockSource.setProvenBlockNumber(0);
      (client as any).keepAttestationsInPoolFor = keepAttestationsInPoolFor;
      await client.start();
      expect(attestationPool.deleteAttestationsOlderThan).not.toHaveBeenCalled();

      await advanceToProvenBlock(advanceToProvenBlockNumber);

      expect(attestationPool.deleteAttestationsOlderThan).toHaveBeenCalledTimes(1);
      expect(attestationPool.deleteAttestationsOlderThan).toHaveBeenCalledWith(
        BigInt(advanceToProvenBlockNumber - keepAttestationsInPoolFor),
      );
    });
  });
});
