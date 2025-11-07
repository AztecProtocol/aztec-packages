import { Blob, type BlobJson } from '@aztec/blob-lib';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';

import { BlobSinkServer } from '../server/server.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import { HttpBlobSinkClient } from './http.js';
import { runBlobSinkClientTests } from './tests.js';

describe('HttpBlobSinkClient', () => {
  runBlobSinkClientTests(async () => {
    const server = new TestBlobSinkServer({ port: 0 });
    await server.start();

    const client = new HttpBlobSinkClient({
      blobSinkUrl: `http://localhost:${server.port}`,
    });

    return {
      client,
      cleanup: async () => {
        await server.stop();
      },
    };
  });

  it('should handle server connection errors gracefully', async () => {
    const client = new HttpBlobSinkClient({ blobSinkUrl: 'http://localhost:12345' }); // Invalid port
    const blob = Blob.fromFields([Fr.random()]);
    const blobHash = blob.getEthVersionedBlobHash();

    const success = await client.sendBlobsToBlobSink([blob]);
    expect(success).toBe(false);

    const retrievedBlobs = await client.getBlobSidecar('0x1234', [blobHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  describe('Mock Ethereum Clients', () => {
    let blobSinkServer: TestBlobSinkServer;

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
      executionHostServer = http.createServer((req, res) => {
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

    afterEach(async () => {
      await blobSinkServer?.stop();
      executionHostServer?.close();
      consensusHostServer?.close();

      executionHostPort = undefined;
      consensusHostPort = undefined;
    });

    // When the consensus host is not responding, we should still be able to request blobs with the block hash
    it('should handle no consensus host', async () => {
      blobSinkServer = new TestBlobSinkServer({ port: 0 });
      await blobSinkServer.start();

      const blobSinkSpy = jest.spyOn(blobSinkServer.blobStore, 'getBlobsByHashes');

      await startExecutionHostServer();

      const client = new HttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
      });

      const success = await client.sendBlobsToBlobSink(testBlobs);
      expect(success).toBe(true);

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      // Check that the blob sink was called with the correct blob hash
      expect(blobSinkSpy).toHaveBeenCalledWith(testBlobsHashes);
    });

    // When the consensus host is responding, we should request blobs from the consensus host
    // based on the slot number
    it('should request based on slot where consensus host is provided', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
    });

    it('should handle when multiple consensus hosts are provided', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: ['invalidURL', `http://localhost:${consensusHostPort}`, 'invalidURL'],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);
    });

    it('should handle API keys without headers', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer('test-api-key');

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['test-api-key'].map(k => new SecretValue(k)),
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      const clientWithNoKey = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: [].map(k => new SecretValue(k)),
      });

      const retrievedBlobsWithNoKey = await clientWithNoKey.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithNoKey).toEqual([]);

      const clientWithInvalidKey = new HttpBlobSinkClient({
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

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobs).toEqual(testBlobsWithIndex);

      const clientWithWrongHeader = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['WRONG-HEADER'],
      });

      const retrievedBlobsWithWrongHeader = await clientWithWrongHeader.getBlobSidecar('0x1234', testBlobsHashes);
      expect(retrievedBlobsWithWrongHeader).toEqual([]);

      const clientWithWrongKey = new HttpBlobSinkClient({
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
      let client = new HttpBlobSinkClient({
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
      client = new HttpBlobSinkClient({
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
      client = new HttpBlobSinkClient({
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

      const client = new HttpBlobSinkClient({
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

    it('should retrieve blobs from blob sink when it only has a partial set', async () => {
      blobSinkServer = new TestBlobSinkServer({ port: 0 });
      await blobSinkServer.start();

      const blobs = Array.from({ length: 2 }, () => makeRandomBlob(3));
      const blobHashes = blobs.map(b => b.getEthVersionedBlobHash());
      const blobsWithIndex = blobs.map((b, index) => new BlobWithIndex(b, index));

      // Only send the first blob to blob sink
      await blobSinkServer.blobStore.addBlobs([blobsWithIndex[0]]);

      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      // The second blob will be available from consensus
      // Update blobData to include the second blob
      blobData.push(blobsWithIndex[1].toJSON());

      // Request both blobs - blobsWithIndex[0] should come from blob sink, blobsWithIndex[1] from consensus
      const retrievedBlobs = await client.getBlobSidecar('0x1234', blobHashes);

      // Should accumulate both blobs from different sources
      expect(retrievedBlobs).toHaveLength(2);
      expect(retrievedBlobs).toEqual(blobsWithIndex);
    });

    it('should accumulate blobs across all three sources (blob sink, consensus, archive)', async () => {
      blobSinkServer = new TestBlobSinkServer({ port: 0 });
      await blobSinkServer.start();

      // Create three blobs for testing
      const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
      const blobHashes = blobs.map(b => b.getEthVersionedBlobHash());
      const blobsWithIndex = blobs.map((b, index) => new BlobWithIndex(b, index));

      // Blob 0 only in blob sink
      await blobSinkServer.blobStore.addBlobs([blobsWithIndex[0]]);

      // Blob 1 only in consensus host
      await startExecutionHostServer();
      await startConsensusHostServer();
      blobData.push(blobsWithIndex[1].toJSON());

      const client = new TestHttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        archiveApiUrl: `https://api.blobscan.com`,
      });

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

      const client = new HttpBlobSinkClient({
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
      blobSinkServer = new TestBlobSinkServer({ port: 0 });
      await blobSinkServer.start();

      // Create three distinct blobs
      const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
      const blobHashes = blobs.map(b => b.getEthVersionedBlobHash());
      const blobsWithIndex = blobs.map((b, index) => new BlobWithIndex(b, index));

      // Add all blobs to blob sink
      await blobSinkServer.blobStore.addBlobs(blobsWithIndex);

      const client = new HttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
      });

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

      const client = new HttpBlobSinkClient({
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

      const client = new HttpBlobSinkClient({
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
      const client = new TestHttpBlobSinkClient({ archiveApiUrl: `https://api.blobscan.com` });
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

      const client = new TestHttpBlobSinkClient({ archiveApiUrl: `https://api.blobscan.com` });
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

      const client = new TestHttpBlobSinkClient({
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

class TestHttpBlobSinkClient extends HttpBlobSinkClient {
  public getArchiveClient() {
    return this.archiveClient!;
  }
}

class TestBlobSinkServer extends BlobSinkServer {
  declare public blobStore: BlobSinkServer['blobStore'];
}
