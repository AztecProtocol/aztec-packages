import { MockL2BlockSource } from '@aztec/archiver/test';
import { L2Block, mockEpochProofQuote, mockTx } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { expect, jest } from '@jest/globals';

import { type EpochProofQuotePool, type P2PService } from '../index.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { P2PClient } from './p2p_client.js';

/**
 * Mockify helper for testing purposes.
 */
type Mockify<T> = {
  [P in keyof T]: ReturnType<typeof jest.fn>;
};

describe('In-Memory P2P Client', () => {
  let txPool: Mockify<TxPool>;
  let attestationPool: Mockify<AttestationPool>;
  let epochProofQuotePool: Mockify<EpochProofQuotePool>;
  let mempools: MemPools;
  let blockSource: MockL2BlockSource;
  let p2pService: Mockify<P2PService>;
  let kvStore: AztecKVStore;
  let client: P2PClient;
  const telemetryClient: TelemetryClient = new NoopTelemetryClient();

  beforeEach(() => {
    txPool = {
      addTxs: jest.fn(),
      getTxByHash: jest.fn().mockReturnValue(undefined),
      deleteTxs: jest.fn(),
      getAllTxs: jest.fn().mockReturnValue([]),
      getAllTxHashes: jest.fn().mockReturnValue([]),
      getMinedTxHashes: jest.fn().mockReturnValue([]),
      getPendingTxHashes: jest.fn().mockReturnValue([]),
      getTxStatus: jest.fn().mockReturnValue(undefined),
      markAsMined: jest.fn(),
      markMinedAsPending: jest.fn(),
    };

    p2pService = {
      start: jest.fn(),
      stop: jest.fn(),
      propagate: jest.fn(),
      registerBlockReceivedCallback: jest.fn(),
      sendRequest: jest.fn(),
      getEnr: jest.fn(),
    };

    attestationPool = {
      addAttestations: jest.fn(),
      deleteAttestations: jest.fn(),
      deleteAttestationsForSlot: jest.fn(),
      getAttestationsForSlot: jest.fn().mockReturnValue(undefined),
    };

    epochProofQuotePool = {
      addQuote: jest.fn(),
      getQuotes: jest.fn().mockReturnValue([]),
      deleteQuotesToEpoch: jest.fn(),
    };

    blockSource = new MockL2BlockSource();
    blockSource.createBlocks(100);

    mempools = {
      txPool,
      attestationPool,
      epochProofQuotePool,
    };

    kvStore = openTmpStore();
    client = new P2PClient(kvStore, blockSource, mempools, p2pService, 0, telemetryClient);
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

  it('republishes previously stored txs on start', async () => {
    const tx1 = mockTx();
    const tx2 = mockTx();
    txPool.getAllTxs.mockReturnValue([tx1, tx2]);

    await client.start();
    expect(p2pService.propagate).toHaveBeenCalledTimes(2);
    expect(p2pService.propagate).toHaveBeenCalledWith(tx1);
    expect(p2pService.propagate).toHaveBeenCalledWith(tx2);
  });

  it('restores the previous block number it was at', async () => {
    await client.start();
    await client.stop();

    const client2 = new P2PClient(kvStore, blockSource, mempools, p2pService, 0, telemetryClient);
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
    client = new P2PClient(kvStore, blockSource, mempools, p2pService, 10, telemetryClient);
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
    client = new P2PClient(kvStore, blockSource, mempools, p2pService, 0, telemetryClient);

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

  it('deletes expired proof quotes', async () => {
    client = new P2PClient(kvStore, blockSource, mempools, p2pService, 0, telemetryClient);

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
      client = new P2PClient(kvStore, blockSource, mempools, p2pService, 10, telemetryClient);
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
      client = new P2PClient(kvStore, blockSource, mempools, p2pService, 10, telemetryClient);
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

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7971): tests for attestation pool pruning
});
