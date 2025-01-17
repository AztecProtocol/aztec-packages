import { Blob, makeEncodedBlob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import http from 'http';
import { type AddressInfo } from 'net';

import { BlobSinkServer } from '../server/server.js';
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
    const blob = Blob.fromFields([Fr.random()]);

    const success = await client.sendBlobsToBlobSink('0x1234', [blob]);
    expect(success).toBe(false);

    const retrievedBlobs = await client.getBlobSidecar('0x1234');
    expect(retrievedBlobs).toEqual([]);
  });

  describe('Mock Ethereum Clients', () => {
    let blobSinkServer: BlobSinkServer;

    let testBlob: Blob;

    let executionHostServer: http.Server | undefined = undefined;
    let executionHostPort: number | undefined = undefined;

    let consensusHostServer: http.Server | undefined = undefined;
    let consensusHostPort: number | undefined = undefined;

    const MOCK_SLOT_NUMBER = 1;

    beforeEach(() => {
      testBlob = makeEncodedBlob(3);
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

    const startConsensusHostServer = (): Promise<void> => {
      consensusHostServer = http.createServer((req, res) => {
        if (req.url?.includes('/eth/v1/beacon/headers/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { header: { message: { slot: MOCK_SLOT_NUMBER } } } }));
        } else if (req.url?.includes('/eth/v1/beacon/blob_sidecars/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              data: [
                {
                  index: 0,
                  blob: `0x${Buffer.from(testBlob.data).toString('hex')}`,
                  // eslint-disable-next-line camelcase
                  kzg_commitment: `0x${testBlob.commitment.toString('hex')}`,
                  // eslint-disable-next-line camelcase
                  kzg_proof: `0x${testBlob.proof.toString('hex')}`,
                },
              ],
            }),
          );
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
        l1RpcUrl: `http://localhost:${executionHostPort}`,
      });

      const success = await client.sendBlobsToBlobSink('0x1234', [testBlob]);
      expect(success).toBe(true);

      const retrievedBlobs = await client.getBlobSidecar('0x1234');
      expect(retrievedBlobs).toEqual([testBlob]);

      // Check that the blob sink was called with the correct block hash and no index
      expect(blobSinkSpy).toHaveBeenCalledWith('0x1234', undefined);
    });

    // When the consensus host is responding, we should request blobs from the consensus host
    // based on the slot number
    it('should request based on slot where consensus host is provided', async () => {
      blobSinkServer = new BlobSinkServer({
        port: 0,
      });
      await blobSinkServer.start();

      await startExecutionHostServer();
      await startConsensusHostServer();

      const client = new HttpBlobSinkClient({
        blobSinkUrl: `http://localhost:${blobSinkServer.port}`,
        l1RpcUrl: `http://localhost:${executionHostPort}`,
        l1ConsensusHostUrl: `http://localhost:${consensusHostPort}`,
      });

      const success = await client.sendBlobsToBlobSink('0x1234', [testBlob]);
      expect(success).toBe(true);

      const retrievedBlobs = await client.getBlobSidecar('0x1234');
      expect(retrievedBlobs).toEqual([testBlob]);
    });
  });
});
