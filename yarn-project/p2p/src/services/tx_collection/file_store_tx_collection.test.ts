import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxPool } from '../../mem_pools/index.js';
import { FileStoreTxCollection } from './file_store_tx_collection.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import { TxCollectionSink } from './tx_collection_sink.js';

describe('FileStoreTxCollection', () => {
  let fileStoreCollection: FileStoreTxCollection;
  let fileStoreSources: MockProxy<FileStoreTxSource>[];
  let txCollectionSink: TxCollectionSink;
  let txPool: MockProxy<TxPool>;

  let txs: Tx[];
  let txHashes: TxHash[];

  const makeFileStoreSource = (name: string) => {
    const source = mock<FileStoreTxSource>();
    source.getInfo.mockReturnValue(name);
    source.getTxsByHash.mockResolvedValue([]);
    return source;
  };

  const makeTx = async () => {
    const tx = Tx.random();
    await tx.recomputeHash();
    return tx;
  };

  const setFileStoreTxs = (source: MockProxy<FileStoreTxSource>, txs: Tx[]) => {
    source.getTxsByHash.mockImplementation(hashes => {
      return Promise.resolve(hashes.map(h => txs.find(tx => tx.getTxHash().equals(h))));
    });
  };

  /** Waits for the sink to emit txs-added events for the expected number of txs. */
  const waitForTxsAdded = (expectedCount: number) => {
    const { promise, resolve } = promiseWithResolvers<void>();
    let count = 0;
    const handler = ({ txs }: { txs: Tx[] }) => {
      count += txs.length;
      if (count >= expectedCount) {
        txCollectionSink.removeListener('txs-added', handler);
        resolve();
      }
    };
    txCollectionSink.on('txs-added', handler);
    return promise;
  };

  beforeEach(async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);

    txPool = mock<TxPool>();
    txPool.addTxs.mockImplementation(txs => Promise.resolve(txs.length));

    const log = createLogger('test');
    txCollectionSink = new TxCollectionSink(txPool, getTelemetryClient(), log);

    fileStoreSources = [makeFileStoreSource('store1'), makeFileStoreSource('store2')];

    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, log);

    txs = await Promise.all([makeTx(), makeTx(), makeTx()]);
    txHashes = txs.map(tx => tx.getTxHash());
  });

  afterEach(async () => {
    await fileStoreCollection.stop();
    jest.restoreAllMocks();
  });

  it('downloads txs immediately when startCollecting is called', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    // Set up event listener before calling startCollecting
    const txsAddedPromise = waitForTxsAdded(txs.length);

    fileStoreCollection.startCollecting(txHashes);

    // Wait for all txs to be processed via events
    await txsAddedPromise;

    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addTxs).toHaveBeenCalledWith(expect.arrayContaining([txs[0]]), { source: 'tx-collection' });
    expect(txPool.addTxs).toHaveBeenCalledWith(expect.arrayContaining([txs[1]]), { source: 'tx-collection' });
    expect(txPool.addTxs).toHaveBeenCalledWith(expect.arrayContaining([txs[2]]), { source: 'tx-collection' });
  });

  it('skips txs marked as found while queued', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    // Queue all txs, then mark the first as found before workers process it
    fileStoreCollection.startCollecting(txHashes);
    fileStoreCollection.foundTxs([txs[0]]);

    // Set up event listener - only 2 txs should be downloaded
    const txsAddedPromise = waitForTxsAdded(2);

    // Wait for workers to process
    await txsAddedPromise;

    // First tx should not have been requested from file store
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);
  });

  it('stops tracking txs when foundTxs is called', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    // Mark first tx as found before queueing
    fileStoreCollection.foundTxs([txs[0]]);

    // Set up event listener - only 2 txs should be downloaded
    const txsAddedPromise = waitForTxsAdded(2);

    // Queue all txs - but first one was already found
    fileStoreCollection.startCollecting(txHashes);

    // Wait for workers to process
    await txsAddedPromise;

    // First tx should not have been requested from any file store
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);

    // Verify second and third tx were downloaded
    expect(txPool.addTxs).toHaveBeenCalledWith(expect.arrayContaining([txs[1]]), { source: 'tx-collection' });
    expect(txPool.addTxs).toHaveBeenCalledWith(expect.arrayContaining([txs[2]]), { source: 'tx-collection' });
  });

  it('tries multiple file stores when tx not found in first', async () => {
    // Only second store has tx[0]
    setFileStoreTxs(fileStoreSources[1], [txs[0]]);

    fileStoreCollection.start();

    // Set up event listener
    const txsAddedPromise = waitForTxsAdded(1);

    fileStoreCollection.startCollecting([txHashes[0]]);
    await txsAddedPromise;

    // First store was tried but didn't have it
    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    // Second store was tried and found it
    expect(fileStoreSources[1].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addTxs).toHaveBeenCalledWith([txs[0]], { source: 'tx-collection' });
  });

  it('does not start workers if no file store sources are configured', async () => {
    const log = createLogger('test');
    fileStoreCollection = new FileStoreTxCollection([], txCollectionSink, log);
    fileStoreCollection.start();
    fileStoreCollection.startCollecting(txHashes);

    // Give some time for potential processing
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();
  });

  it('does not re-queue txs that are already pending', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    // Set up event listener
    const txsAddedPromise = waitForTxsAdded(txs.length);

    fileStoreCollection.startCollecting(txHashes);
    fileStoreCollection.startCollecting(txHashes); // Duplicate call

    await txsAddedPromise;

    // Each tx should only be downloaded once
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    expect(allCalls.length).toBe(txHashes.length);
  });
});
