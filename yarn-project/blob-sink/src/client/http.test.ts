import { Blob, type BlobJson } from '@aztec/blob-lib';
import { makeEncodedBlob, makeUnencodedBlob } from '@aztec/blob-lib/testing';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';

import { BlobSinkServer } from '../server/server.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import { runBlobSinkClientTests } from './blob-sink-client-tests.js';
import { HttpBlobSinkClient } from './http.js';

describe('HttpBlobSinkClient', () => {
  runBlobSinkClientTests(async () => {
    const server = new BlobSinkServer({
      port: 0,
    });
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
    const blob = await Blob.fromFields([Fr.random()]);
    const blobHash = blob.getEthVersionedBlobHash();

    const success = await client.sendBlobsToBlobSink('0x1234', [blob]);
    expect(success).toBe(false);

    const retrievedBlobs = await client.getBlobSidecar('0x1234', [blobHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  describe('Mock Ethereum Clients', () => {
    let blobSinkServer: BlobSinkServer;

    let testEncodedBlob: Blob;
    let testEncodedBlobHash: Buffer;
    let testEncodedBlobWithIndex: BlobWithIndex;

    let testNonEncodedBlob: Blob;
    let testNonEncodedBlobHash: Buffer;

    // A blob to be ignored when requesting blobs
    // - we do not include it's blobHash in our queries
    let testBlobIgnore: Blob;

    let executionHostServer: http.Server | undefined = undefined;
    let executionHostPort: number | undefined = undefined;

    let consensusHostServer: http.Server | undefined = undefined;
    let consensusHostPort: number | undefined = undefined;

    let blobData: BlobJson[];

    const MOCK_SLOT_NUMBER = 1;

    beforeEach(async () => {
      testEncodedBlob = await makeEncodedBlob(3);
      testEncodedBlobHash = testEncodedBlob.getEthVersionedBlobHash();
      testEncodedBlobWithIndex = new BlobWithIndex(testEncodedBlob, 0);

      testBlobIgnore = await makeEncodedBlob(3);

      testNonEncodedBlob = await makeUnencodedBlob(3);
      testNonEncodedBlobHash = testNonEncodedBlob.getEthVersionedBlobHash();

      blobData = [
        // Correctly encoded blob
        {
          index: '0',
          blob: `0x${Buffer.from(testEncodedBlob.data).toString('hex')}`,
          // eslint-disable-next-line camelcase
          kzg_commitment: `0x${testEncodedBlob.commitment.toString('hex')}`,
        },
        // Correctly encoded blob, but we do not ask for it in the client
        {
          index: '1',
          blob: `0x${Buffer.from(testBlobIgnore.data).toString('hex')}`,
          // eslint-disable-next-line camelcase
          kzg_commitment: `0x${testBlobIgnore.commitment.toString('hex')}`,
        },
        // Incorrectly encoded blob
        {
          index: '2',
          blob: `0x${Buffer.from(testNonEncodedBlob.data).toString('hex')}`,
          // eslint-disable-next-line camelcase
          kzg_commitment: `0x${testNonEncodedBlob.commitment.toString('hex')}`,
        },
      ];
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
          res.end(JSON.stringify({ data: { header: { message: { slot: MOCK_SLOT_NUMBER } } } }));
        } else if (req.url?.includes('/eth/v1/beacon/blob_sidecars/')) {
          if (req.url?.includes('33')) {
            // test for L1 missed slot
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
      blobSinkServer = new BlobSinkServer({
        port: 0,
      });
      await blobSinkServer.start();

      const blobSinkSpy = jest.spyOn((blobSinkServer as any).blobStore, 'getBlobSidecars');

      await startExecutionHostServer();

      const client = new HttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
      });

      const success = await client.sendBlobsToBlobSink('0x1234', [testEncodedBlob]);
      expect(success).toBe(true);

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

      // Check that the blob sink was called with the correct block hash and no index
      expect(blobSinkSpy).toHaveBeenCalledWith('0x1234', undefined);
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

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);
    });

    it('should handle when multiple consensus hosts are provided', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: ['invalidURL', `http://localhost:${consensusHostPort}`, 'invalidURL'],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);
    });

    it('should handle API keys without headers', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer('test-api-key');

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['test-api-key'].map(k => new SecretValue(k)),
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

      const clientWithNoKey = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: [].map(k => new SecretValue(k)),
      });

      const retrievedBlobsWithNoKey = await clientWithNoKey.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobsWithNoKey).toEqual([]);

      const clientWithInvalidKey = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['invalid-key'].map(k => new SecretValue(k)),
      });

      const retrievedBlobsWithInvalidKey = await clientWithInvalidKey.getBlobSidecar('0x1234', [testEncodedBlobHash]);
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

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

      const clientWithWrongHeader = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['header-api-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['WRONG-HEADER'],
      });

      const retrievedBlobsWithWrongHeader = await clientWithWrongHeader.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobsWithWrongHeader).toEqual([]);

      const clientWithWrongKey = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeys: ['invalid-key'].map(k => new SecretValue(k)),
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
      });

      const retrievedBlobsWithWrongKey = await clientWithWrongKey.getBlobSidecar('0x1234', [testEncodedBlobHash]);
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

      let retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

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

      retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

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

      retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);
    });

    it('even if we ask for non-encoded blobs, we should only get encoded blobs', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
      });

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash, testNonEncodedBlobHash]);
      // We should only get the correctly encoded blob
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);
    });

    it('should handle L1 missed slots', async () => {
      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        l1RpcUrls: [`http://localhost:${executionHostPort}`],
        l1ConsensusHostUrls: [`http://localhost:${consensusHostPort}`],
        l1ConsensusHostApiKeyHeaders: ['X-API-KEY'],
        l1ConsensusHostApiKeys: ['my-api-key'],
      });

      // Add spy on the fetch method
      const fetchSpy = jest.spyOn(client as any, 'fetch');

      const retrievedBlobs = await client.getBlobSidecarFrom(
        `http://localhost:${consensusHostPort}`,
        33,
        [testEncodedBlobHash],
        [],
        3,
        0,
      );

      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);

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

    it('should fall back to archive client', async () => {
      const client = new TestHttpBlobSinkClient({ archiveApiUrl: `https://api.blobscan.com` });
      const archiveSpy = jest.spyOn(client.getArchiveClient(), 'getBlobsFromBlock').mockResolvedValue(blobData);

      const retrievedBlobs = await client.getBlobSidecar('0x1234', [testEncodedBlobHash]);
      expect(retrievedBlobs).toEqual([testEncodedBlobWithIndex]);
      expect(archiveSpy).toHaveBeenCalledWith('0x1234');
    });
  });
});

class TestHttpBlobSinkClient extends HttpBlobSinkClient {
  public getArchiveClient() {
    return this.archiveClient!;
  }
}
