import { Blob } from '@aztec/blob-lib';
import { makeEncodedBlob } from '@aztec/blob-lib/testing';
import type { L2BlockProposedEvent, ViemPublicClient } from '@aztec/ethereum';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFile } from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';
import { join } from 'path';
import request from 'supertest';

import { BlobscanBlockResponseSchema } from '../archive/blobscan_archive_client.js';
import type { BlobArchiveClient } from '../archive/interface.js';
import { HttpBlobSinkClient } from '../client/http.js';
import type { BlobSinkClientInterface } from '../client/interface.js';
import { outboundTransform } from '../encoding/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import type { BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

describe('BlobSinkService', () => {
  let service: BlobSinkServer;

  const startServer = async (
    config: Partial<BlobSinkConfig & { httpClient: BlobSinkClientInterface; l1Client: ViemPublicClient }> = {},
  ) => {
    service = new BlobSinkServer({ ...config, port: 0 }, undefined, config.httpClient, config.l1Client);
    await service.start();
  };

  afterEach(async () => {
    await service.stop();
  });

  describe('status', () => {
    beforeEach(() => startServer());

    it('should return 200', async () => {
      const response = await request(service.getApp()).get('/status');
      expect(response.status).toBe(200);
    });
  });

  describe('store', () => {
    const blockId = '0x1234';

    let blob: Blob;
    let blob2: Blob;

    beforeEach(async () => {
      await startServer();

      blob = await makeEncodedBlob(3);
      blob2 = await makeEncodedBlob(3);
      // Post the blob
      const postResponse = await request(service.getApp())
        .post('/blob_sidecar')
        .send({
          // eslint-disable-next-line camelcase
          block_id: blockId,
          blobs: [
            {
              index: 0,
              blob: outboundTransform(blob.toBuffer()),
            },
            {
              index: 1,
              blob: outboundTransform(blob2.toBuffer()),
            },
          ],
        });

      expect(postResponse.status).toBe(200);
    });

    it('should retrieve the blob', async () => {
      // Retrieve the blob
      const getResponse = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}`);

      expect(getResponse.status).toBe(200);

      // Convert the response blob back to a Blob object and verify it matches
      const retrievedBlobs = getResponse.body.data;
      const retrievedBlob = await Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      const retrievedBlob2 = await Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[1].blob.slice(2), 'hex'));

      expect(retrievedBlob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
      expect(retrievedBlob.evaluate().proof.toString('hex')).toBe(blob.evaluate().proof.toString('hex'));

      expect(retrievedBlob2.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob2.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob2.evaluate().proof.toString('hex')).toBe(blob2.evaluate().proof.toString('hex'));
    });

    it('should retrieve specific indicies', async () => {
      // We can also request specific indicies
      const getWithIndicies = await request(service.getApp()).get(
        `/eth/v1/beacon/blob_sidecars/${blockId}?indices=0,1`,
      );

      expect(getWithIndicies.status).toBe(200);
      expect(getWithIndicies.body.data.length).toBe(2);

      const retrievedBlobs = getWithIndicies.body.data;
      const retrievedBlob = await Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      const retrievedBlob2 = await Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[1].blob.slice(2), 'hex'));
      expect(retrievedBlob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
      expect(retrievedBlob.evaluate().proof.toString('hex')).toBe(blob.evaluate().proof.toString('hex'));

      expect(retrievedBlob2.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob2.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob2.evaluate().proof.toString('hex')).toBe(blob2.evaluate().proof.toString('hex'));
    });

    it('should retrieve a single index', async () => {
      const getWithIndicies = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}?indices=1`);

      expect(getWithIndicies.status).toBe(200);
      expect(getWithIndicies.body.data.length).toBe(1);

      const retrievedBlobs = getWithIndicies.body.data;
      const retrievedBlob = await Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      expect(retrievedBlob.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob.evaluate().proof.toString('hex')).toBe(blob2.evaluate().proof.toString('hex'));
    });
  });

  describe('errors', () => {
    beforeEach(() => startServer());

    it('should return an error if invalid indicies are provided', async () => {
      const blockId = '0x1234';

      const response = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}?indices=word`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid indices parameter');
    });

    it('should return an error if the block ID is invalid (POST)', async () => {
      const response = await request(service.getApp()).post('/blob_sidecar').send({
        // eslint-disable-next-line camelcase
        block_id: undefined,
      });

      expect(response.status).toBe(400);
    });

    it('should return an error if the block ID is invalid (GET)', async () => {
      const response = await request(service.getApp()).get('/eth/v1/beacon/blob_sidecars/invalid-id');

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent blob', async () => {
      const response = await request(service.getApp()).get('/eth/v1/beacon/blob_sidecars/0x999999');

      expect(response.status).toBe(404);
    });

    it('should reject negative block IDs', async () => {
      const response = await request(service.getApp()).get('/eth/v1/beacon/blob_sidecars/-123');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid block_id parameter');
    });
  });

  describe('with l1 client', () => {
    let l1Client: MockProxy<ViemPublicClient>;
    let blob: Blob;
    let blob2: Blob;

    const blockId = '0x1234';

    beforeEach(async () => {
      blob = await makeEncodedBlob(3);
      blob2 = await makeEncodedBlob(3);
      l1Client = mock<ViemPublicClient>();
      l1Client.getContractEvents.mockResolvedValue([
        {
          args: {
            versionedBlobHashes: [bufferToHex(blob.getEthVersionedBlobHash())],
            archive: '0x5678',
            blockNumber: 1234n,
          } satisfies L2BlockProposedEvent,
        } as any,
      ]);

      await startServer({ l1Client });
    });

    afterEach(() => {
      expect(l1Client.getContractEvents).toHaveBeenCalledTimes(1);
      expect(l1Client.getContractEvents).toHaveBeenCalledWith(expect.objectContaining({ blockHash: blockId }));
    });

    it('should accept blobs emitted by rollup contract', async () => {
      const postResponse = await request(service.getApp())
        .post('/blob_sidecar')
        .send({
          // eslint-disable-next-line camelcase
          block_id: blockId,
          blobs: [{ index: 0, blob: outboundTransform(blob.toBuffer()) }],
        });

      expect(postResponse.status).toBe(200);
    });

    it('should reject blobs not emitted by rollup contract', async () => {
      const postResponse = await request(service.getApp())
        .post('/blob_sidecar')
        .send({
          // eslint-disable-next-line camelcase
          block_id: blockId,
          blobs: [
            { index: 0, blob: outboundTransform(blob.toBuffer()) },
            { index: 1, blob: outboundTransform(blob2.toBuffer()) },
          ],
        });

      expect(postResponse.status).toBe(400);
    });
  });

  describe('with archive', () => {
    let archiveClient: MockProxy<BlobArchiveClient>;

    beforeEach(async () => {
      archiveClient = mock<BlobArchiveClient>();
      const httpClient = new HttpBlobSinkClient({}, { archiveClient });
      await startServer({ httpClient });
    });

    it('should retrieve the blob from archive and store locally', async () => {
      // Actual blockId from Sepolia with an Aztec tx, corresponds to blobscan_get_block.json fixture
      const blockId = '0x7d81980a40426c40544f0f729ada953be406730b877b5865d6cdc35cc8f9c84e';
      const dataPath = join(fileURLToPath(import.meta.url), '../..', 'archive/fixtures', 'blobscan_get_block.json');
      const expectedBlobJsons = BlobscanBlockResponseSchema.parse(JSON.parse(await readFile(dataPath, 'utf-8')));
      archiveClient.getBlobsFromBlock.mockResolvedValue(expectedBlobJsons);

      const getResponse = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}`);
      expect(getResponse.status).toBe(200);

      // Even though the block has two blobs, only one is of interest to us
      expect(getResponse.body.data.length).toBe(1);
      const expectedBlobWithIndex = new BlobWithIndex(await Blob.fromJson(expectedBlobJsons[0]), 0);
      const retrievedBlobWithIndex = new BlobWithIndex(
        await Blob.fromEncodedBlobBuffer(hexToBuffer(getResponse.body.data[0].blob)),
        getResponse.body.data[0].index,
      );
      expect(retrievedBlobWithIndex.toJSON()).toEqual(expectedBlobWithIndex.toJSON());

      // Re-fetching should not hit the archive client again
      const getResponse2 = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}`);
      expect(getResponse2.status).toBe(200);
      expect(getResponse2.body.data.length).toBe(1);

      expect(archiveClient.getBlobsFromBlock).toHaveBeenCalledTimes(1);
    });
  });
});
