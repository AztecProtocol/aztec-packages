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
import { type IRequestTracker, RequestTracker } from './request_tracker.js';
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
  let requestTracker: IRequestTracker;

  // Track in-flight startCollecting invocations so afterEach can shut them down cleanly.
  let activeTrackers: IRequestTracker[];
  let activePromises: Promise<void>[];

  const makeFileStoreSource = (name: string) => {
    const source = mock<FileStoreTxSource>();
    source.getInfo.mockReturnValue(name);
    source.getTxsByHash.mockResolvedValue({ validTxs: [], invalidTxHashes: [] });
    return source;
  };

  const makeTx = async () => {
    const tx = Tx.random();
    await tx.recomputeHash();
    return tx;
  };

  const setFileStoreTxs = (source: MockProxy<FileStoreTxSource>, txs: Tx[]) => {
    source.getTxsByHash.mockImplementation(hashes => {
      return Promise.resolve({
        validTxs: hashes.map(h => txs.find(tx => tx.getTxHash().equals(h))).filter(tx => tx !== undefined),
        invalidTxHashes: [],
      });
    });
  };

  /** Spawns a collection run and registers it for afterEach cleanup. */
  const startCollecting = (tracker: IRequestTracker, ctx: TxAddContext): Promise<void> => {
    activeTrackers.push(tracker);
    const promise = fileStoreCollection.startCollecting(tracker, ctx);
    activePromises.push(promise);
    return promise;
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
    while (Date.now() - start < 60_000) {
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
    requestTracker = RequestTracker.create(txHashes, deadline, dateProvider);

    activeTrackers = [];
    activePromises = [];
  });

  afterEach(async () => {
    for (const t of activeTrackers) {
      t.cancel();
    }
    await Promise.allSettled(activePromises);
    jest.restoreAllMocks();
  });

  it('downloads txs when startCollecting is called', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    const txsAddedPromise = waitForTxsAdded(txs.length);
    void startCollecting(requestTracker, context);
    await txsAddedPromise;

    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addMinedTxs).toHaveBeenCalled();
  });

  it('skips txs already marked fetched on the tracker', async () => {
    setFileStoreTxs(fileStoreSources[0], txs);

    // Mark first tx as found before queueing so it's never queued in the first place
    requestTracker.markFetched(txs[0]);

    void startCollecting(requestTracker, context);

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

    const tracker = RequestTracker.create([txHashes[0]], deadline, dateProvider);
    const txsAddedPromise = waitForTxsAdded(1);
    void startCollecting(tracker, context);
    await txsAddedPromise;

    // Both stores should have been tried
    expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    expect(fileStoreSources[1].getTxsByHash).toHaveBeenCalled();
    expect(txPool.addMinedTxs).toHaveBeenCalled();
  });

  it('does not start workers if no file store sources are configured', async () => {
    const log = createLogger('test');
    fileStoreCollection = new FileStoreTxCollection([], txCollectionSink, config, dateProvider, log);

    // With no sources, startCollecting resolves immediately without making any calls.
    await startCollecting(requestTracker, context);

    expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();
  });

  it('retries across sources when tx is not found initially', async () => {
    // Use a single worker to make behavior deterministic
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 100, backoffMaxMs: 500 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    // Initially both sources return empty
    const tracker = RequestTracker.create([txHashes[0]], deadline, dateProvider);
    void startCollecting(tracker, context);

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

  it('does not start collecting if tracker is already cancelled', async () => {
    requestTracker.cancel();

    await startCollecting(requestTracker, context);

    // startCollecting returns immediately without spawning workers when tracker is cancelled
    expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();
  });

  it('stops trying for txs marked fetched on the tracker after queuing', async () => {
    const log = createLogger('test');
    config = { workerCount: 1, backoffBaseMs: 50, backoffMaxMs: 100 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    setFileStoreTxs(fileStoreSources[0], [txs[1]]);

    void startCollecting(requestTracker, context);

    // Externally mark tx[0] as found via the tracker (simulating node/reqresp/gossip finding it).
    // startCollecting yields before spawning workers, so this runs before any source call is made.
    requestTracker.markFetched(txs[0]);

    const txsAddedPromise = waitForTxsAdded(1);
    await txsAddedPromise;

    // tx[0] should never have been attempted by the file store
    const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
    const requestedHashes = allCalls.flat().flat();
    expect(requestedHashes).not.toContainEqual(txHashes[0]);
  });

  it('workers exit when tracker is cancelled', async () => {
    // Long backoff so workers spend most of their time sleeping after a single attempt
    const log = createLogger('test');
    config = { workerCount: 2, backoffBaseMs: 60_000, backoffMaxMs: 60_000 };
    fileStoreCollection = new FileStoreTxCollection(fileStoreSources, txCollectionSink, config, dateProvider, log);

    // Pre-set the tracker timer so a cancellation does not require real-time deadline expiry
    const tracker = RequestTracker.create(txHashes, deadline, dateProvider);
    const promise = startCollecting(tracker, context);

    // Let workers do at least one round of attempts
    await waitForSourceCalls(fileStoreSources, 2);

    tracker.cancel();

    // The startCollecting promise resolves once all workers settle. Without this guarantee, the
    // test would either hang or leak workers — both are caught by Jest's default timeout.
    await promise;
  });
});
