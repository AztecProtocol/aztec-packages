import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { InMemoryFileStore } from '@aztec/stdlib/file-store';
import { Tx, type TxValidator } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { InMemoryTxPool } from '../../test-helpers/testbench-utils.js';
import { FileStoreTxSource } from '../tx_collection/file_store_tx_source.js';
import type { TxFileStoreConfig } from './config.js';
import { TxFileStore } from './tx_file_store.js';

describe('TxFileStore', () => {
  let fileStore: InMemoryFileStore;
  let txPool: InMemoryTxPool;
  let config: TxFileStoreConfig;
  let txFileStore: TxFileStore | undefined;
  let mockValidator: MockProxy<TxValidator>;
  const log = createLogger('test:tx_file_store');
  const basePath = 'aztec-1-1-0x1234';
  const storeNamespace = 'tx-file-store-test';
  const storeUrl = `mem://${storeNamespace}`;

  const makeTx = async () => {
    const tx = Tx.random();
    await tx.recomputeHash();
    return tx;
  };

  /** Counts tx files uploaded to the store under basePath. */
  function countUploadedFiles(): number {
    return fileStore.listFiles(`${basePath}/txs`).length;
  }

  beforeEach(() => {
    // Fresh in-memory store per test. Using an in-memory store (rather than a real on-disk file
    // store) keeps these tests deterministic — they exercise TxFileStore, not file-store I/O.
    InMemoryFileStore.clear(storeNamespace);
    fileStore = new InMemoryFileStore(storeNamespace);
    txPool = new InMemoryTxPool();
    mockValidator = mock<TxValidator>();
    mockValidator.validateTx.mockResolvedValue({ result: 'valid' });

    config = {
      txFileStoreEnabled: true,
      txFileStoreUrl: storeUrl,
      txFileStoreUploadConcurrency: 2,
      txFileStoreMaxQueueSize: 10,
    };
  });

  afterEach(async () => {
    if (txFileStore) {
      await txFileStore.stop();
      txFileStore = undefined;
    }
  });

  describe('create', () => {
    it('returns undefined when disabled', async () => {
      config.txFileStoreEnabled = false;
      const result = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      expect(result).toBeUndefined();
    });

    it('returns undefined when upload URL is not configured', async () => {
      config.txFileStoreUrl = undefined;
      const result = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      expect(result).toBeUndefined();
    });

    it('creates file store when enabled and configured', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      expect(txFileStore).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('subscribes to txs-added event on start', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);

      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledWith(`${basePath}/txs/${tx.getTxHash().toString()}.bin`, tx.toBuffer(), {
        compress: true,
      });

      spy.mockRestore();
    });

    it('unsubscribes from txs-added event on stop', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx1 = await makeTx();
      await txPool.addPendingTxs([tx1]);
      await txFileStore!.flush();

      const countBefore = countUploadedFiles();
      expect(countBefore).toBe(1);

      await txFileStore!.stop();

      // Add another tx after stopping - should not be uploaded
      // stop() synchronously removes the event listener, so no race condition
      const tx2 = await makeTx();
      await txPool.addPendingTxs([tx2]);

      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });
  });

  describe('tx upload', () => {
    it('uploads tx when txs-added event fires', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);

      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledWith(`${basePath}/txs/${tx.getTxHash().toString()}.bin`, tx.toBuffer(), {
        compress: true,
      });

      spy.mockRestore();
    });

    it('uploads multiple txs', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx1 = await makeTx();
      const tx2 = await makeTx();
      await txPool.addPendingTxs([tx1, tx2]);

      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });

    it('respects concurrency limit', async () => {
      config.txFileStoreUploadConcurrency = 10;
      config.txFileStoreMaxQueueSize = 100; // Increase to accommodate 20 txs
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      let activeCalls = 0;
      let maxConcurrent = 0;

      const originalSave = fileStore.save.bind(fileStore);
      const spy = jest.spyOn(fileStore, 'save').mockImplementation(async (...args) => {
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);
        // Add small delay to create window for concurrent calls
        await sleep(20);
        const result = await originalSave(...args);
        activeCalls--;
        return result;
      });

      // Add 20 txs at once
      const txs = await Promise.all(
        Array(20)
          .fill(0)
          .map(() => makeTx()),
      );
      await txPool.addPendingTxs(txs);

      await txFileStore!.flush();

      expect(maxConcurrent).toBeLessThanOrEqual(10);
      expect(maxConcurrent).toBeGreaterThan(1); // Verify some parallelism occurred
      expect(spy).toHaveBeenCalledTimes(20);

      spy.mockRestore();
    });

    it('skips duplicate tx uploads', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx = await makeTx();

      // Upload same tx twice
      await txPool.addPendingTxs([tx]);
      await txFileStore!.flush();

      await txPool.addPendingTxs([tx]);
      await txFileStore!.flush(); // Dedup happens synchronously before upload starts

      // Should only upload once (second is deduplicated)
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    it('drops oldest txs when queue exceeds max size', async () => {
      config.txFileStoreUploadConcurrency = 1;
      config.txFileStoreMaxQueueSize = 2;
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      // Queue 4 txs - with maxQueueSize=2, overflow logic drops 2 oldest
      const txs = await Promise.all([makeTx(), makeTx(), makeTx(), makeTx()]);
      await txPool.addPendingTxs(txs);

      // Check pending count immediately after enqueue (before processing)
      // 4 added - 2 dropped = 2 remaining in queue (+ 0 active at this point)
      expect(txFileStore!.getPendingUploadCount()).toBe(2);

      await txFileStore!.flush();

      // Should have uploaded 2 (2 oldest were dropped when queue was full)
      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('retries on transient failures', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const originalSave = fileStore.save.bind(fileStore);
      const spy = jest
        .spyOn(fileStore, 'save')
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockImplementation(originalSave);

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);

      // flush() waits for all uploads including retries
      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledTimes(3);
      expect(countUploadedFiles()).toBe(1);

      spy.mockRestore();
    }, 10000);

    it('continues processing after exhausting retries', async () => {
      // Use concurrency=1 to ensure sequential processing for predictable retry behavior
      config.txFileStoreUploadConcurrency = 1;
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const originalSave = fileStore.save.bind(fileStore);
      const spy = jest
        .spyOn(fileStore, 'save')
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockRejectedValueOnce(new Error('Fail 4')) // Exhausts all 4 attempts for tx1
        .mockImplementation(originalSave); // tx2 succeeds

      const tx1 = await makeTx();
      const tx2 = await makeTx();
      await txPool.addPendingTxs([tx1, tx2]);

      // flush() waits for all uploads including retries
      await txFileStore!.flush();

      // tx1 failed after 4 attempts (initial + 3 retries), tx2 succeeded
      expect(spy).toHaveBeenCalledTimes(5);
      expect(countUploadedFiles()).toBe(1);

      spy.mockRestore();
    }, 10000);
  });

  describe('tx download validation', () => {
    it('rejects tx when validator returns invalid', async () => {
      const tx = await makeTx();
      await fileStore.save(`${basePath}/txs/${tx.txHash.toString()}.bin`, tx.toBuffer(), { compress: false });

      mockValidator.validateTx.mockResolvedValueOnce({ result: 'invalid', reason: ['invalid'] });
      const source = (await FileStoreTxSource.create(storeUrl, basePath, mockValidator, log))!;
      const result = await source.getTxsByHash([tx.txHash]);

      expect(result.validTxs).toHaveLength(0);
      expect(result.invalidTxHashes).toEqual([tx.txHash.toString()]);
    });

    it('accepts tx when validator returns valid', async () => {
      const tx = await makeTx();
      await fileStore.save(`${basePath}/txs/${tx.txHash.toString()}.bin`, tx.toBuffer(), { compress: false });

      const source = (await FileStoreTxSource.create(storeUrl, basePath, mockValidator, log))!;
      const result = await source.getTxsByHash([tx.txHash]);

      expect(result.validTxs).toHaveLength(1);
      expect(result.invalidTxHashes).toHaveLength(0);
    });

    it('partitions txs based on validator result', async () => {
      const tx1 = await makeTx();
      const tx2 = await makeTx();
      await fileStore.save(`${basePath}/txs/${tx1.txHash.toString()}.bin`, tx1.toBuffer(), { compress: false });
      await fileStore.save(`${basePath}/txs/${tx2.txHash.toString()}.bin`, tx2.toBuffer(), { compress: false });

      mockValidator.validateTx
        .mockResolvedValueOnce({ result: 'valid' })
        .mockResolvedValueOnce({ result: 'invalid', reason: ['bad'] });

      const source = (await FileStoreTxSource.create(storeUrl, basePath, mockValidator, log))!;
      const result = await source.getTxsByHash([tx1.txHash, tx2.txHash]);

      expect(result.validTxs).toHaveLength(1);
      expect(result.invalidTxHashes).toHaveLength(1);
    });
  });

  describe('getPendingUploadCount', () => {
    it('returns correct count of pending uploads', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      expect(txFileStore!.getPendingUploadCount()).toBe(0);

      const tx1 = await makeTx();
      const tx2 = await makeTx();
      await txPool.addPendingTxs([tx1, tx2]);

      // Check immediately after enqueue (before processing starts)
      expect(txFileStore!.getPendingUploadCount()).toBe(2);

      // Wait for uploads to complete
      await txFileStore!.flush();

      expect(txFileStore!.getPendingUploadCount()).toBe(0);
    });
  });

  describe('compression round-trip', () => {
    it('uploads compressed tx and reads it back via FileStoreTxSource', async () => {
      txFileStore = await TxFileStore.create(txPool, config, basePath, log, undefined, fileStore);
      txFileStore!.start();

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);
      await txFileStore!.flush();

      // Read back via FileStoreTxSource using the same local file store
      const txSource = await FileStoreTxSource.create(storeUrl, basePath, mockValidator, log);
      expect(txSource).toBeDefined();

      const results = await txSource!.getTxsByHash([tx.getTxHash()]);
      expect(results.validTxs).toHaveLength(1);
      expect(results.validTxs[0]).toBeDefined();
      expect(results.validTxs[0]!.toBuffer()).toEqual(tx.toBuffer());
    });
  });
});
