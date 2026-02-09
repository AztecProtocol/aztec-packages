import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { TestDateProvider } from '@aztec/foundation/timer';
import { L2Block } from '@aztec/stdlib/block';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
import { type FileStoreCollectionConfig, FileStoreTxCollection } from './file_store_tx_collection.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import { type TxAddContext, TxCollectionSink } from './tx_collection_sink.js';

describe('FileStoreTxCollection', () => {
  let fileStoreCollection: FileStoreTxCollection;
  let fileStoreSources: MockProxy<FileStoreTxSource>[];
  let txCollectionSink: TxCollectionSink;
  let txPool: MockProxy<TxPoolV2>;
  let context: TxAddContext;
  let dateProvider: TestDateProvider;
  let deadline: Date;
  let config: FileStoreCollectionConfig;

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
    source.getTxsByHash.mockImplementation(hashes =>
      Promise.resolve(hashes.map(h => txs.find(tx => tx.getTxHash().equals(h)))),
    );
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

  /** Waits until the total number of getTxsByHash calls across all sources reaches the expected count. */
  const waitForSourceCalls = async (sources: MockProxy<FileStoreTxSource>[], totalCalls: number) => {
    const start = Date.now();
    while (Date.now() - start < 5_000) {
      const total = sources.reduce((sum, s) => sum + s.getTxsByHash.mock.calls.length, 0);
      if (total >= totalCalls) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const total = sources.reduce((sum, s) => sum + s.getTxsByHash.mock.calls.length, 0);
    throw new Error(`Timed out waiting for ${totalCalls} source calls (got ${total})`);
  };

  beforeEach(async () => {
    txPool = mock<TxPoolV2>();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    dateProvider = new TestDateProvider();

    const log = createLogger('test');
    txCollectionSink = new TxCollectionSink(txPool, getTelemetryClient(), log);

    fileStoreSources = [makeFileStoreSource('store1'), makeFileStoreSource('store2')];

    config = {
      workerCount: 5,
      backoffBaseMs: 1000,
      backoffMaxMs: 5000,
    };

    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    txs = await Promise.all([makeTx(), makeTx(), makeTx()]);
    txHashes = txs.map(tx => tx.getTxHash());

    const block = await L2Block.random(BlockNumber(1));
    context = { type: 'mined', block };
    deadline = new Date(dateProvider.now() + 60 * 60 * 1000);
  });

  afterEach(async () => {
    await fileStoreCollection.stop();
    jest.restoreAllMocks();
  });

  it('downloads txs when startCollecting is called', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    const txsAddedPromise = waitForTxsAdded(txs.length);
    fileStoreCollection.startCollecting(txHashes, context, deadline);
    await txsAddedPromise;

    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addMinedTxs).toHaveBeenCalled();
  });

  it('skips txs marked as found', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    fileStoreCollection.start();

    fileStoreCollection.startCollecting(txHashes, context, deadline);
    fileStoreCollection.foundTxs([txs[0]]);

    const txsAddedPromise = waitForTxsAdded(2);
    await txsAddedPromise;

    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);
  });

  it('tries multiple file stores via round-robin', async () => {
    // Only second store has tx[0]
    setFileStoreTxs(fileStoreSources[1], [txs[0]]);

    // Pin random so we always start at source 0, ensuring we test the fallback to source 1
    jest.spyOn(Math, 'random').mockReturnValue(0);

    fileStoreCollection.start();

    const txsAddedPromise = waitForTxsAdded(1);
    fileStoreCollection.startCollecting([txHashes[0]], context, deadline);
    await txsAddedPromise;

    // Both stores should have been tried
    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    expect(fileStoreSources[1].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addMinedTxs).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('does not start workers if no file store sources are configured', () => {
    const log = createLogger('test');
    fileStoreCollection = new FileStoreTxCollection([], txCollectionSink, config, dateProvider, log);
    fileStoreCollection.start();
    fileStoreCollection.startCollecting(txHashes, context, deadline);

    // With no sources, start() is a no-op (no workers spawned) and startCollecting() returns
    // immediately, so no calls should have been made synchronously.
    expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();
  });

  it('does not re-queue txs that are already pending', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);
    setFileStoreTxs(fileStoreSources[1], txs);

    // Use single worker for deterministic behavior
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 1000, backoffMaxMs: 5000 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    fileStoreCollection.start();

    const txsAddedPromise = waitForTxsAdded(txs.length);

    fileStoreCollection.startCollecting(txHashes, context, deadline);
    fileStoreCollection.startCollecting(txHashes, context, deadline); // Duplicate call

    await txsAddedPromise;

    // With 1 worker processing sequentially, each tx should be found on the first source.
    // Duplicate startCollecting should not create extra entries.
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    expect(allCalls.length).toBe(txHashes.length);
  });

  it('retries across sources when tx is not found initially', async () => {
    // Use a single worker to make behavior deterministic
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 100, backoffMaxMs: 500 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    fileStoreCollection.start();

    // Initially both sources return empty
    fileStoreCollection.startCollecting([txHashes[0]], context, deadline);

    // Wait for first full cycle (2 sources = 2 calls)
    await waitForSourceCalls(fileStoreSources, 2);

    // Now make second source return the tx
    setFileStoreTxs(fileStoreSources[1], [txs[0]]);

    // Advance time past backoff so the worker retries
    dateProvider.setTime(dateProvider.now() + 200);

    const txsAddedPromise = waitForTxsAdded(1);
    await txsAddedPromise;

    expect(txPool.addMinedTxs).toHaveBeenCalled();
  });

  it('expires entries past deadline', async () => {
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 50, backoffMaxMs: 100 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    // Set a very short deadline
    const shortDeadline = new Date(dateProvider.now() + 100);

    fileStoreCollection.start();
    fileStoreCollection.startCollecting([txHashes[0]], context, shortDeadline);

    // Wait for first full cycle (2 sources = 2 calls)
    await waitForSourceCalls(fileStoreSources, 2);

    // Advance time past the deadline
    dateProvider.setTime(dateProvider.now() + 200);

    // Clear mocks so we can distinguish new calls from old ones
    jest.clearAllMocks();

    // Add a new entry with a valid deadline and set up source to return it.
    // This proves the worker is alive and the expired entry was cleaned up.
    setFileStoreTxs(fileStoreSources[0], [txs[1]]);
    const txsAddedPromise = waitForTxsAdded(1);
    fileStoreCollection.startCollecting([txHashes[1]], context, deadline);
    await txsAddedPromise;

    // Only txHashes[1] should have been requested after clearing mocks
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);
    expect(requestedHashes).toContainEqual(txHashes[1]);
  });

  it('does not start collecting if deadline is in the past', () => {
    const pastDeadline = new Date(dateProvider.now() - 1000);

    fileStoreCollection.start();
    fileStoreCollection.startCollecting(txHashes, context, pastDeadline);

    // startCollecting returns immediately without adding entries when deadline is past
    expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();
  });

  it('foundTxs stops retry for found txs', async () => {
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 50, backoffMaxMs: 100 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    setFileStoreTxs(fileStoreSources[0], [txs[1]]);

    fileStoreCollection.start();
    fileStoreCollection.startCollecting(txHashes, context, deadline);

    // Mark first tx as found
    fileStoreCollection.foundTxs([txs[0]]);

    const txsAddedPromise = waitForTxsAdded(1);
    await txsAddedPromise;

    // tx[0] should never have been attempted
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);
  });

  it('clearPending removes all entries', async () => {
    fileStoreCollection.start();
    fileStoreCollection.startCollecting(txHashes, context, deadline);
    fileStoreCollection.clearPending();

    // Verify workers are alive but the cleared entries are gone by adding
    // a new entry and confirming only it gets processed.
    setFileStoreTxs(fileStoreSources[0], [txs[0]]);
    const txsAddedPromise = waitForTxsAdded(1);
    fileStoreCollection.startCollecting([txHashes[0]], context, deadline);
    await txsAddedPromise;

    // Only the newly added tx[0] should have been requested, not all 3 original txs
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[1]);
    expect(requestedHashes).not.toContainEqual(txHashes[2]);
  });
});
