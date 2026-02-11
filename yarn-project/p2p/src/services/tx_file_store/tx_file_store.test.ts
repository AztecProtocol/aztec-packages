import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type FileStore, createFileStore } from '@aztec/stdlib/file-store';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { InMemoryTxPool } from '../../test-helpers/testbench-utils.js';
import { FileStoreTxSource } from '../tx_collection/file_store_tx_source.js';
import type { TxFileStoreConfig } from './config.js';
import { TxFileStore } from './tx_file_store.js';

describe('TxFileStore', () => {
  let tmpDir: string;
  let fileStore: FileStore;
  let txPool: InMemoryTxPool;
  let config: TxFileStoreConfig;
  let txFileStore: TxFileStore | undefined;
  const log = createLogger('test:tx_file_store');

  const makeTx = async () => {
    const tx = Tx.random();
    await tx.recomputeHash();
    return tx;
  };

  /** Counts files in the txs subdirectory of the temp directory. */
  async function countUploadedFiles(): Promise<number> {
    try {
      const files = await readdir(join(tmpDir, 'txs'));
      return files.length;
    } catch {
      return 0;
    }
  }

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tx-file-store-test-'));
  });

  beforeEach(async () => {
    // Clean up any files from previous test
    try {
      await rm(join(tmpDir, 'txs'), { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    fileStore = await createFileStore(`file://${tmpDir}`);
    txPool = new InMemoryTxPool();

    config = {
      txFileStoreEnabled: true,
      txFileStoreUrl: `file://${tmpDir}`,
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

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('returns undefined when disabled', async () => {
      config.txFileStoreEnabled = false;
      const result = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      expect(result).toBeUndefined();
    });

    it('returns undefined when upload URL is not configured', async () => {
      config.txFileStoreUrl = undefined;
      const result = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      expect(result).toBeUndefined();
    });

    it('creates file store when enabled and configured', async () => {
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      expect(txFileStore).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('subscribes to txs-added event on start', async () => {
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);

      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledWith(`txs/${tx.getTxHash().toString()}.bin`, tx.toBuffer(), { compress: false });

      spy.mockRestore();
    });

    it('unsubscribes from txs-added event on stop', async () => {
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx1 = await makeTx();
      await txPool.addPendingTxs([tx1]);
      await txFileStore!.flush();

      const countBefore = await countUploadedFiles();
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
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
      txFileStore!.start();

      const spy = jest.spyOn(fileStore, 'save');

      const tx = await makeTx();
      await txPool.addPendingTxs([tx]);

      await txFileStore!.flush();

      expect(spy).toHaveBeenCalledWith(`txs/${tx.getTxHash().toString()}.bin`, tx.toBuffer(), { compress: false });

      spy.mockRestore();
    });

    it('uploads multiple txs', async () => {
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      expect(await countUploadedFiles()).toBe(1);

      spy.mockRestore();
    }, 10000);

    it('continues processing after exhausting retries', async () => {
      // Use concurrency=1 to ensure sequential processing for predictable retry behavior
      config.txFileStoreUploadConcurrency = 1;
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
      expect(await countUploadedFiles()).toBe(1);

      spy.mockRestore();
    }, 10000);
  });

  describe('tx download validation', () => {
    it('rejects tx with invalid hash when reading from file store', async () => {
      // Write a tx with a mismatched hash directly to the file store
      const invalidTx = Tx.random(); // random hash does not match computed hash
      await fileStore.save(`txs/${invalidTx.txHash.toString()}.bin`, invalidTx.toBuffer(), { compress: false });

      // Read it back via FileStoreTxSource
      const source = (await FileStoreTxSource.create(`file://${tmpDir}`, log))!;
      const result = await source.getTxsByHash([invalidTx.txHash]);

      expect(result.validTxs).toHaveLength(0);
      expect(result.invalidTxHashes).toEqual([invalidTx.txHash.toString()]);
    });

    it('rejects tx when tx with wrong hash is returned', async () => {
      // Write a tx with a mismatched hash directly to the file store
      const invalidTx = Tx.random(); // random hash does not match computed hash
      const validTx = await makeTx();
      await fileStore.save(`txs/${invalidTx.txHash.toString()}.bin`, validTx.toBuffer(), { compress: false });

      // Read it back via FileStoreTxSource
      const source = (await FileStoreTxSource.create(`file://${tmpDir}`, log))!;
      const result = await source.getTxsByHash([invalidTx.txHash]);

      expect(result.validTxs).toHaveLength(0);
      expect(result.invalidTxHashes).toEqual([validTx.txHash.toString()]);
    });

    it('accepts correct tx', async () => {
      // Write a tx with a mismatched hash directly to the file store
      const validTx = await makeTx();
      await fileStore.save(`txs/${validTx.txHash.toString()}.bin`, validTx.toBuffer(), { compress: false });

      // Read it back via FileStoreTxSource
      const source = (await FileStoreTxSource.create(`file://${tmpDir}`, log))!;
      const result = await source.getTxsByHash([validTx.txHash]);

      expect(result.validTxs).toHaveLength(1);
      expect(result.invalidTxHashes).toHaveLength(0);
    });
  });

  describe('getPendingUploadCount', () => {
    it('returns correct count of pending uploads', async () => {
      txFileStore = await TxFileStore.create(txPool, config, log, undefined, fileStore);
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
});
