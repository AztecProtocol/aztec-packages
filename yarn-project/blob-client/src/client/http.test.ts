import { Blob, type BlobJson } from '@aztec/blob-lib';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';

import type { FileStoreBlobClient } from '../filestore/filestore_blob_client.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import { HttpBlobClient } from './http.js';

describe('HttpBlobClient', () => {
  it('should handle no sources configured', async () => {
    const client = new HttpBlobClient({});
    const blob = Blob.fromFields([Fr.random()]);
    const blobHash = blob.getEthVersionedBlobHash();

    const success = await client.sendBlobsToFilestore([blob]);
    expect(success).toBe(false);

    const retrievedBlobs = await client.getBlobSidecar('0x1234', [blobHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  describe('Mock Ethereum Clients', () => {
    let testBlobs: Blob[];
    let testBlobsHashes: Buffer[];
    let testBlobsWithIndex: BlobWithIndex[];

    let executionHostServer: http.Server | undefined = undefined;
    let executionHostPort: number | undefined = undefined;

    let consensusHostServer: http.Server | undefined = undefined;
    let consensusHostPort: number | undefined = undefined;

    let blobData: BlobJson[];

    let latestSlotNumber: number;
    let missedSlots: number[];

    beforeEach(() => {
      latestSlotNumber = 1;
      missedSlots = [];

      testBlobs = Array.from({ length: 2 }, () => makeRandomBlob(3));
      testBlobsHashes = testBlobs.map(b => b.getEthVersionedBlobHash());
      testBlobsWithIndex = testBlobs.map((b, index) => new BlobWithIndex(b, index));

      blobData = testBlobsWithIndex.map(b => b.toJSON());
    });

    const startExecutionHostServer = (): Promise<void> => {
      executionHostServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: { parentBeaconBlockRoot: '0x1234' } }));
      });

      return new Promise((resolve, _reject) => {
        executionHostServer?.listen(0, () => {
          executionHostPort = (executionHostServer?.address() as AddressInfo).port;
          resolve();
        });
      });
    };

    const startConsensusHostServer = (requireApiKey?: string, requireApiKeyHeader?: string): Promise<void> => {
      consensusHostServer = http.createServer((req, res) => {
        let isAuthorized = true;
        if (requireApiKey) {
          if (requireApiKeyHeader) {
            const authHeader = req.headers[requireApiKeyHeader.toLowerCase()];
            isAuthorized = authHeader === requireApiKey;
          } else {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const apiKey = url.searchParams.get('key');
            isAuthorized = apiKey === requireApiKey;
          }
        }

        // If API key is required but not valid, reject the request
        if (requireApiKey && !isAuthorized) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid API key' }));
          return;
        }

        if (req.url?.includes('/eth/v1/beacon/headers/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { header: { message: { slot: latestSlotNumber } } } }));
        } else if (req.url?.includes('/eth/v1/beacon/blob_sidecars/')) {
          if (missedSlots.some(slot => req.url?.includes(`/${slot}`))) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: blobData }));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });

      return new Promise((resolve, _reject) => {
        consensusHostServer?.listen(0, () => {
          consensusHostPort = (consensusHostServer?.address() as AddressInfo).port;
          resolve();
        });
      });
    };

    afterEach(() => {
      executionHostServer?.close();
      consensusHostServer?.close();

      executionHostPort = undefined;
      consensusHostPort = undefined;
    });

    // When the consensus host is responding, we should request blobs from the consensus host
    // based on the slot number
    it('should request based on slot where consensus host is provided', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
    });

    it('should handle when multiple consensus hosts are provided', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: ['invalidURL', `http://localhost:${consensusHostPort}`, 'invalidURL'],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
    });

    it('should handle API keys without headers', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer('test-api-key');

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['test-api-key'].map(k => new SecretValue(k)),
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      const clientWithNoKey = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: [].map(k => new SecretValue(k)),
      });

      const retrievedBlobsWithNoKey = await clientWithNoKey.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithNoKey).toEqual([]);

      const clientWithInvalidKey = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['invalid-key'].map(k => new SecretValue(k)),
      });

      const retrievedBlobsWithInvalidKey = await clientWithInvalidKey.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithInvalidKey).toEqual([]);
    });

    it('should handle API keys in headers', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer('header-api-key', 'X-API-KEY');

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      const clientWithWrongHeader = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['WRONG-HEADER'],
      });

      const retrievedBlobsWithWrongHeader = await clientWithWrongHeader.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithWrongHeader).toEqual([]);

      const clientWithWrongKey = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['invalid-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
      });

      const retrievedBlobsWithWrongKey = await clientWithWrongKey.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithWrongKey).toEqual([]);
    });

    it('should handle multiple consensus hosts with different API key methods', async () => {
      await startExecutionHostServer();

      // Create three separate servers for each API key scenario
      await startConsensusHostServer();
      const consensusPort1 = consensusHostPort;
      const consensusServer1 = consensusHostServer;
      await startConsensusHostServer('test-api-key');
      const consensusPort2 = consensusHostPort;
      const consensusServer2 = consensusHostServer;
      await startConsensusHostServer('header-api-key', 'X-API-KEY');
      const consensusPort3 = consensusHostPort;

      // Verify that the first consensus host works
      let client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [
          `http://localhost:${consensusPort1}`,
          `http://localhost:${consensusPort2}`,
          `http://localhost:${consensusPort3}`,
        ],
        l1ConsensusHostApiKeys: ['', 'test-api-key', 'header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['', '', 'X-API-KEY'],
      });

      let retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      // Verify that the second consensus host works when the first host fails
      consensusServer1?.close();
      client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [
          `http://localhost:${consensusPort1}`,
          `http://localhost:${consensusPort2}`,
          `http://localhost:${consensusPort3}`,
        ],
        l1ConsensusHostApiKeys: ['', 'test-api-key', 'header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['', '', 'X-API-KEY'],
      });

      retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      // Verify that the third consensus host works when the first and second hosts fail
      consensusServer2?.close();
      client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [
          `http://localhost:${consensusPort1}`,
          `http://localhost:${consensusPort2}`,
          `http://localhost:${consensusPort3}`,
        ],
        l1ConsensusHostApiKeys: ['', 'test-api-key', 'header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['', '', 'X-API-KEY'],
      });

      retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
    });

    it('accumulates successfully retrieved blobs even if some fail', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      // Create a blob that has mismatch data and commitment.
      const randomBlobs = Array.from({ length: 2 }, () => makeRandomBlob(3));
      const incorrectBlob = new Blob(randomBlobs[0].data, randomBlobs[1].commitment);
      const incorrectBlobHash = incorrectBlob.getEthVersionedBlobHash();
      const incorrectBlobWithIndex = new BlobWithIndex(incorrectBlob, 2);
      // Update blobData to include the incorrect blob
      blobData.push(incorrectBlobWithIndex.toJSON());

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [
        testBlobsHashes[0],
        incorrectBlobHash,
        testBlobsHashes[1],
      ]);

      // Should return the successfully retrieved blob, discarding the one that has mismatch data and commitment.
      expect(retrievedBlobs.length).toEqual(2);
      expect(retrievedBlobs).toEqual([testBlobsWithIndex[0], testBlobsWithIndex[1]]);
    });

    it('should accumulate blobs across all three sources (filestore, consensus, archive)', async () => {
      // Create three blobs for testing
      const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
      const blobHashes = blobs.map(b => b.getEthVersionedBlobHash());
      const blobsWithIndex = blobs.map((b, index) => new BlobWithIndex(b, index));
      blobsWithIndex[0].index = -1;

      // Blob 0 only in filestore
      const mockFileStore = new MockFileStoreBlobClient();
      mockFileStore.addBlobWithIndex(blobsWithIndex[0]);

      // Blob 1 only in consensus host
      await startExecutionHostServer();
      await startConsensusHostServer();
      blobData.push(blobsWithIndex[1].toJSON());

      const client = new TestHttpBlobClient(
        {
          l1RpcUrls: [`http://localhost:${executionHostPort}`],
          l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
          archiveApiUrl: `https://api.blobscan.com`,
        },
        { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] },
      );

      // Blob 2 only in archive
      const blob3Json = blobsWithIndex[2].toJSON();
      const archiveSpy = jest.spyOn(client.getArchiveClient(), 'getBlobsFromBlock').mockResolvedValue([blob3Json]);

      // Request all three blobs
      const retrievedBlobs = await client.getBlobSidecar('0x1234', blobHashes);

      // Should accumulate all three blobs from different sources
      expect(retrievedBlobs).toHaveLength(3);
      expect(retrievedBlobs).toEqual(blobsWithIndex);
      expect(archiveSpy).toHaveBeenCalledWith('0x1234');
    });

    it('should return duplicate blobs when same hash is requested multiple times', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      // Request the same blob hash twice
      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testBlobsHashes[0], testBlobsHashes[0]]);

      // Should return two blobs with the same content
      expect(retrievedBlobs).toHaveLength(2);
      expect(retrievedBlobs).toEqual([testBlobsWithIndex[0], testBlobsWithIndex[0]]);
    });

    it('should preserve blob order when requesting multiple blobs', async () => {
      // Create three distinct blobs
      const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
      const blobHashes = blobs.map(b => b.getEthVersionedBlobHash());
      const blobsWithIndex = blobs.map(b => new BlobWithIndex(b, -1));

      // Add all blobs to filestore
      const mockFileStore = new MockFileStoreBlobClient();
      blobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));

      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      // Request blobs in a specific order: blob3, blob1, blob2, blob1 (with duplicate)
      const retrievedBlobs = await client.getBlobSidecar('0x1234', [
        blobHashes[2],
        blobHashes[0],
        blobHashes[1],
        blobHashes[0],
      ]);

      // Should return blobs in the exact order requested
      expect(retrievedBlobs).toHaveLength(4);
      expect(retrievedBlobs).toEqual([blobsWithIndex[2], blobsWithIndex[0], blobsWithIndex[1], blobsWithIndex[0]]);
    });

    it('should handle L1 missed slots', async () => {
      latestSlotNumber = 50;
      missedSlots = [33];

      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
        l1ConsensusHostApiKeys: [new SecretValue('my-api-key')],
      });

      // Add spy on the fetch method
      const fetchSpy = jest.spyOn(client as any, 'fetch');

      const retrievedBlobs = await client.getBlobSidecarFrom(
        `http://localhost:${consensusHostPort}`,
        33,
        testBlobsHashes,
        [],
        0,
      );

      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      // Verify we hit the 404 for slot 33 before trying slot 34, and that we use the api key header
      // (see issue https://github.com/AztecProtocol/aztec-packages/issues/13415)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/eth/v1/beacon/blob_sidecars/33'),
        expect.objectContaining({ headers: { ['X-API-KEY']: 'my-api-key' } }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/eth/v1/beacon/blob_sidecars/34'),
        expect.objectContaining({ headers: { ['X-API-KEY']: 'my-api-key' } }),
      );
    });

    it('should handle L1 missed slots up to the latest slot', async () => {
      latestSlotNumber = 38;
      missedSlots = times(100, i => i);

      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      // Add spy on the fetch method
      const fetchSpy = jest.spyOn(client as any, 'fetch');

      const retrievedBlobs = await client.getBlobSidecarFrom(
        `http://localhost:${consensusHostPort}`,
        33,
        testBlobsHashes,
        [],
        0,
      );

      expect(retrievedBlobs).toEqual([]);

      expect(fetchSpy).toHaveBeenCalledTimes(latestSlotNumber - 33 + 2);
      for (let i = 33; i <= latestSlotNumber; i++) {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining(`/eth/v1/beacon/blob_sidecars/${i}`),
          expect.anything(),
        );
      }
    });

    it('should fall back to archive client', async () => {
      const client = new TestHttpBlobClient({ archiveApiUrl: `https://api.blobscan.com` });
      const archiveSpy = jest.spyOn(client.getArchiveClient(), 'getBlobsFromBlock').mockResolvedValue(blobData);

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
      expect(archiveSpy).toHaveBeenCalledWith('0x1234');
    });

    it('should return only one blob when multiple blobs with the same blobHash exist on a block', async () => {
      // Create a blob data array with two blobs that have the same commitment (thus same blobHash)
      const blob = makeRandomBlob(3);
      const blobHash = blob.getEthVersionedBlobHash();
      const duplicateBlobData = [new BlobWithIndex(blob, 0), new BlobWithIndex(blob, 1)];

      const client = new TestHttpBlobClient({ archiveApiUrl: `https://api.blobscan.com` });
      const archiveSpy = jest
        .spyOn(client.getArchiveClient(), 'getBlobsFromBlock')
        .mockResolvedValue(duplicateBlobData.map(b => b.toJSON()));

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [blobHash]);

      // Should only return one blob despite two blobs with the same hash existing
      expect(retrievedBlobs).toHaveLength(1);
      expect(retrievedBlobs[0].blob).toEqual(blob);
      expect(archiveSpy).toHaveBeenCalledWith('0x1234');
    });

    it('should return empty array from consensus host if it returns blob json with incorrect format', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new TestHttpBlobClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      const blob = makeRandomBlob(3);
      const blobHash = blob.getEthVersionedBlobHash();
      const blobWithIndex = new BlobWithIndex(blob, 0);
      const blobJson = blobWithIndex.toJSON();

      const originalBlobData = blobData;

      // Incorrect bytes for the data.
      blobData = [
        ...originalBlobData,
        {
          ...blobJson,
          blob: 'abcdefghijk',
        },
      ];
      expect(await client.getBlobSidecar('0x1234', [blobHash])).toEqual([]);

      // Incorrect bytes for the commitment.
      blobData = [
        ...originalBlobData,
        {
          ...blobJson,
          // eslint-disable-next-line camelcase
          kzg_commitment: 'abcdefghijk',
        },
      ];
      expect(await client.getBlobSidecar('0x1234', [blobHash])).toEqual([]);

      // Commitment does not exist.
      blobData = [
        ...originalBlobData,
        {
          blob: blobJson.blob,
          index: blobJson.index,
        } as BlobJson,
      ];
      expect(await client.getBlobSidecar('0x1234', [blobHash])).toEqual([]);

      // Correct blob json.
      blobData = [...originalBlobData, blobJson];
      expect(await client.getBlobSidecar('0x1234', [blobHash])).toEqual([blobWithIndex]);
    });
  });
});

class TestHttpBlobClient extends HttpBlobClient {
  public getArchiveClient() {
    return this.archiveClient!;
  }

  public getFileStoreClients() {
    return this.fileStoreClients;
  }
}

class MockFileStoreBlobClient {
  private files = new Map<string, BlobJson>();

  constructor(
    private basePath: string = 'aztec-1-1-0x1234',
    private shouldFail: boolean = false,
  ) {}

  getBlobsByHashes(blobHashes: string[]): Promise<BlobJson[]> {
    if (this.shouldFail) {
      return Promise.reject(new Error('FileStore connection failed'));
    }
    const results: BlobJson[] = [];
    for (const hash of blobHashes) {
      const blob = this.files.get(hash);
      if (blob) {
        results.push({ ...blob, index: '-1' });
      }
    }
    return Promise.resolve(results);
  }

  exists(versionedBlobHash: string): Promise<boolean> {
    return Promise.resolve(this.files.has(versionedBlobHash));
  }

  saveBlob(blob: Blob, _skipIfExists = true): Promise<void> {
    if (this.shouldFail) {
      return Promise.reject(new Error('FileStore save failed'));
    }
    const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;
    this.files.set(versionedHash, blob.toJson(-1));
    return Promise.resolve();
  }

  async saveBlobs(blobs: Blob[] | BlobWithIndex[], skipIfExists = true): Promise<void> {
    await Promise.all(
      blobs.map(b => {
        const blob = 'blob' in b ? b.blob : b;
        return this.saveBlob(blob, skipIfExists);
      }),
    );
  }

  getBaseUrl(): string {
    return this.basePath;
  }

  testConnection(): Promise<boolean> {
    return Promise.resolve(!this.shouldFail);
  }

  // Test helper to pre-populate blobs
  addBlob(blob: Blob): void {
    const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;
    this.files.set(versionedHash, blob.toJson(-1));
  }

  addBlobWithIndex(blobWithIndex: BlobWithIndex): void {
    const versionedHash = `0x${blobWithIndex.blob.getEthVersionedBlobHash().toString('hex')}`;
    this.files.set(versionedHash, blobWithIndex.toJSON());
  }
}

describe('HttpBlobClient FileStore Integration', () => {
  let testBlobs: Blob[];
  let testBlobsHashes: Buffer[];
  let testBlobsWithIndex: BlobWithIndex[];

  beforeEach(() => {
    testBlobs = Array.from({ length: 2 }, () => makeRandomBlob(3));
    testBlobsHashes = testBlobs.map(b => b.getEthVersionedBlobHash());
    testBlobsWithIndex = testBlobs.map((b, index) => new BlobWithIndex(b, index));
  });

  describe('getBlobSidecar with filestore clients', () => {
    it('should fetch blobs from filestore clients', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      testBlobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));

      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      expect(retrievedBlobs).toHaveLength(2);
      expect(retrievedBlobs[0].blob.commitment).toEqual(testBlobs[0].commitment);
      expect(retrievedBlobs[1].blob.commitment).toEqual(testBlobs[1].commitment);
    });

    it('should try multiple filestores when first one does not have blobs', async () => {
      const mockFileStore1 = new MockFileStoreBlobClient('store1');
      const mockFileStore2 = new MockFileStoreBlobClient('store2');

      // Only add blobs to second store
      testBlobsWithIndex.forEach(b => mockFileStore2.addBlobWithIndex(b));

      const client = new HttpBlobClient(
        {},
        {
          fileStoreClients: [
            mockFileStore1 as unknown as FileStoreBlobClient,
            mockFileStore2 as unknown as FileStoreBlobClient,
          ],
        },
      );

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      expect(retrievedBlobs).toHaveLength(2);
    });

    it('should accumulate blobs from multiple filestores', async () => {
      const mockFileStore1 = new MockFileStoreBlobClient('store1');
      const mockFileStore2 = new MockFileStoreBlobClient('store2');

      // Split blobs across stores
      mockFileStore1.addBlobWithIndex(testBlobsWithIndex[0]);
      mockFileStore2.addBlobWithIndex(testBlobsWithIndex[1]);

      const client = new HttpBlobClient(
        {},
        {
          fileStoreClients: [
            mockFileStore1 as unknown as FileStoreBlobClient,
            mockFileStore2 as unknown as FileStoreBlobClient,
          ],
        },
      );

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      expect(retrievedBlobs).toHaveLength(2);
    });

    it('should handle filestore errors gracefully', async () => {
      const failingFileStore = new MockFileStoreBlobClient('failing', true);
      const workingFileStore = new MockFileStoreBlobClient('working');
      testBlobsWithIndex.forEach(b => workingFileStore.addBlobWithIndex(b));

      const client = new HttpBlobClient(
        {},
        {
          fileStoreClients: [
            failingFileStore as unknown as FileStoreBlobClient,
            workingFileStore as unknown as FileStoreBlobClient,
          ],
        },
      );

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      expect(retrievedBlobs).toHaveLength(2);
    });
  });

  describe('sendBlobsToFilestore with filestore upload', () => {
    it('should upload blobs to filestore when fileStoreUploadClient is configured', async () => {
      const mockUploadStore = new MockFileStoreBlobClient();
      const saveBlobsSpy = jest.spyOn(mockUploadStore, 'saveBlobs');

      const client = new HttpBlobClient(
        {},
        { fileStoreUploadClient: mockUploadStore as unknown as FileStoreBlobClient },
      );

      const success = await client.sendBlobsToFilestore(testBlobs);

      expect(success).toBe(true);
      expect(saveBlobsSpy).toHaveBeenCalledWith(testBlobs, true);
    });

    it('should return false when both blob client and filestore are not configured', async () => {
      const client = new HttpBlobClient({});

      const success = await client.sendBlobsToFilestore(testBlobs);

      expect(success).toBe(false);
    });

    it('should handle filestore upload failure gracefully', async () => {
      const failingStore = new MockFileStoreBlobClient('failing', true);

      const client = new HttpBlobClient({}, { fileStoreUploadClient: failingStore as unknown as FileStoreBlobClient });

      const success = await client.sendBlobsToFilestore(testBlobs);

      expect(success).toBe(false);
    });
  });

  describe('onBlobsFetched callback', () => {
    it('should fire onBlobsFetched callback after successful fetch', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      testBlobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));

      const onBlobsFetched = jest.fn();
      const client = new HttpBlobClient(
        {},
        {
          fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient],
          onBlobsFetched,
        },
      );

      await client.getBlobSidecar('0x1234', testBlobsHashes);

      // Wait for async callback (1ms is enough since mock resolves immediately)
      await sleep(1);

      expect(onBlobsFetched).toHaveBeenCalledWith(expect.arrayContaining([expect.any(BlobWithIndex)]));
    });

    it('should automatically set up upload callback when fileStoreUploadClient is provided', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      testBlobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));

      const mockUploadStore = new MockFileStoreBlobClient();
      const saveBlobsSpy = jest.spyOn(mockUploadStore, 'saveBlobs');

      const client = new HttpBlobClient(
        {},
        {
          fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient],
          fileStoreUploadClient: mockUploadStore as unknown as FileStoreBlobClient,
        },
      );

      await client.getBlobSidecar('0x1234', testBlobsHashes);

      // Wait for async callback (1ms is enough since mock resolves immediately)
      await sleep(1);

      expect(saveBlobsSpy).toHaveBeenCalled();
    });
  });

  describe('testSources with filestores', () => {
    it('should test filestore connectivity', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      const testConnectionSpy = jest.spyOn(mockFileStore, 'testConnection');

      const client = new HttpBlobClient(
        { blobAllowEmptySources: true },
        { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] },
      );

      await client.testSources();

      expect(testConnectionSpy).toHaveBeenCalled();
    });

    it('should not throw when filestore is reachable', async () => {
      const mockFileStore = new MockFileStoreBlobClient();

      const client = new HttpBlobClient(
        { blobAllowEmptySources: true },
        { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] },
      );

      await expect(client.testSources()).resolves.not.toThrow();
    });

    it('should count filestore as successful source', async () => {
      const mockFileStore = new MockFileStoreBlobClient();

      // No blob client, no consensus, but filestore is available
      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      // Should not throw because filestore counts as a successful source
      await expect(client.testSources()).resolves.not.toThrow();
    });

    it('should handle filestore connection failure', async () => {
      const failingStore = new MockFileStoreBlobClient('failing', true);

      const client = new HttpBlobClient(
        { blobAllowEmptySources: false },
        { fileStoreClients: [failingStore as unknown as FileStoreBlobClient] },
      );

      await expect(client.testSources()).rejects.toThrow('No blob sources are reachable');
    });
  });

  describe('isHistoricalSync flag behavior', () => {
    it('should not retry filestores for historical sync', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      const getBlobsByHashesSpy = jest.spyOn(mockFileStore, 'getBlobsByHashes');

      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      // Historical sync - should not retry
      await client.getBlobSidecar('0x1234', testBlobsHashes, undefined, { isHistoricalSync: true });

      // Should only be called once (no retries)
      expect(getBlobsByHashesSpy).toHaveBeenCalledTimes(1);
    });

    it('should retry filestores with backoff for near-tip sync when blobs not found', async () => {
      jest.useFakeTimers();

      const mockFileStore = new MockFileStoreBlobClient();
      const getBlobsByHashesSpy = jest.spyOn(mockFileStore, 'getBlobsByHashes');

      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      // Near-tip sync (default) - should retry
      const promise = client.getBlobSidecar('0x1234', testBlobsHashes, undefined, { isHistoricalSync: false });

      // Advance all timers to allow retries to complete
      await jest.runAllTimersAsync();

      await promise;

      // Initial call + retries (hardcoded [1, 1, 2] backoff = 4 attempts total)
      // First call in tryFileStores, then 3 more retry attempts
      expect(getBlobsByHashesSpy.mock.calls.length).toBeGreaterThan(1);

      jest.useRealTimers();
    });

    it('should not retry if all blobs found on first try', async () => {
      const mockFileStore = new MockFileStoreBlobClient();
      testBlobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));
      const getBlobsByHashesSpy = jest.spyOn(mockFileStore, 'getBlobsByHashes');

      const client = new HttpBlobClient({}, { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] });

      await client.getBlobSidecar('0x1234', testBlobsHashes, undefined, { isHistoricalSync: false });

      // Should only be called once since all blobs were found
      expect(getBlobsByHashesSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('source ordering', () => {
    let executionHostServer: http.Server | undefined;
    let executionHostPort: number | undefined;
    let consensusHostServer: http.Server | undefined;
    let consensusHostPort: number | undefined;

    const startExecutionHostServer = (): Promise<void> => {
      executionHostServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: { parentBeaconBlockRoot: '0x1234' } }));
      });

      return new Promise((resolve, _reject) => {
        executionHostServer?.listen(0, () => {
          executionHostPort = (executionHostServer?.address() as AddressInfo).port;
          resolve();
        });
      });
    };

    const startConsensusHostServer = (blobData: BlobJson[]): Promise<void> => {
      consensusHostServer = http.createServer((req, res) => {
        if (req.url?.includes('/eth/v1/beacon/headers/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { header: { message: { slot: 1 } } } }));
        } else if (req.url?.includes('/eth/v1/beacon/blob_sidecars/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: blobData }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });

      return new Promise((resolve, _reject) => {
        consensusHostServer?.listen(0, () => {
          consensusHostPort = (consensusHostServer?.address() as AddressInfo).port;
          resolve();
        });
      });
    };

    afterEach(() => {
      executionHostServer?.close();
      consensusHostServer?.close();
      executionHostPort = undefined;
      consensusHostPort = undefined;
    });

    it('should try filestore before consensus host', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer(testBlobsWithIndex.map(b => b.toJSON()));

      const mockFileStore = new MockFileStoreBlobClient();
      testBlobsWithIndex.forEach(b => mockFileStore.addBlobWithIndex(b));

      const client = new HttpBlobClient(
        {
          l1RpcUrls: [`http://localhost:${executionHostPort}`],
          l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        },
        { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] },
      );

      // Spy on fetch to see if consensus is called
      const fetchSpy = jest.spyOn(client as any, 'fetch');

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      expect(retrievedBlobs).toHaveLength(2);
      // Consensus should not be called for blob_sidecars since filestore had all blobs
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('blob_sidecars'), expect.anything());
    });

    it('should fall back to consensus when filestore has partial blobs', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer(testBlobsWithIndex.map(b => b.toJSON()));

      const mockFileStore = new MockFileStoreBlobClient();
      // Only add first blob to filestore
      mockFileStore.addBlobWithIndex(testBlobsWithIndex[0]);

      const client = new HttpBlobClient(
        {
          l1RpcUrls: [`http://localhost:${executionHostPort}`],
          l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        },
        { fileStoreClients: [mockFileStore as unknown as FileStoreBlobClient] },
      );

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);

      // Should have both blobs - one from filestore, one from consensus
      expect(retrievedBlobs).toHaveLength(2);
    });
  });
});
