import { MockL2BlockSource } from '@aztec/archiver/test';
import { mockEpochProofQuote, mockTx } from '@aztec/circuit-types';
import { retryUntil } from '@aztec/foundation/retry';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

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
  let p2pService: MockProxy<P2PService>;

  let mempools: MemPools;
  let blockSource: MockL2BlockSource;
  let kvStore: AztecKVStore;
  let client: P2PClient;

  let telemetryClient: TelemetryClient;

  beforeEach(() => {
    telemetryClient = new NoopTelemetryClient();
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochProofQuotePool = mock<EpochProofQuotePool>();
    p2pService = mock<P2PService>();

    blockSource = new MockL2BlockSource();
    blockSource.createBlocks(100);

    mempools = { txPool, attestationPool, epochProofQuotePool };
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
      client.broadcastEpochProofQuote(quote);
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

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7971): tests for attestation pool pruning
});
