import { Blob } from '@aztec/blob-lib';
import { makeEncodedBlob } from '@aztec/blob-lib/testing';

import request from 'supertest';

import type { BlobSinkClientInterface } from '../client/interface.js';
import { outboundTransform } from '../encoding/index.js';
import type { BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

describe('BlobSinkService', () => {
  let service: BlobSinkServer;

  const startServer = async (config: Partial<BlobSinkConfig & { httpClient: BlobSinkClientInterface }> = {}) => {
    service = new BlobSinkServer({ ...config, port: 0 }, undefined);
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

  describe('store and retrieve', () => {
    let blob0: Blob;
    let blob1: Blob;
    let blobHashes: string[];

    beforeEach(async () => {
      await startServer();

      blob0 = makeEncodedBlob(6);
      blob1 = makeEncodedBlob(8);

      // Post the blobs using new API
      const postResponse = await request(service.getApp())
        .post('/blobs')
        .send({
          blobs: [
            {
              index: 0,
              blob: outboundTransform(blob0.toBuffer()),
            },
            {
              index: 1,
              blob: outboundTransform(blob1.toBuffer()),
            },
          ],
        });

      expect(postResponse.status).toBe(200);
      expect(postResponse.body.blobHashes).toHaveLength(2);
      blobHashes = postResponse.body.blobHashes;
    });

    it('should retrieve blobs by hash', async () => {
      // Retrieve the blobs using their hashes
      const getResponse = await request(service.getApp()).get(`/blobs?blobHashes=${blobHashes.join(',')}`);

      expect(getResponse.status).toBe(200);

      // Convert the response blob back to a Blob object and verify it matches
      const retrievedBlobs = getResponse.body.data;
      expect(retrievedBlobs).toHaveLength(2);

      const retrievedBlob0 = Blob.fromBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      const retrievedBlob1 = Blob.fromBlobBuffer(Buffer.from(retrievedBlobs[1].blob.slice(2), 'hex'));

      expect(retrievedBlob0).toEqual(blob0);
      expect(retrievedBlob1).toEqual(blob1);
    });

    it('should retrieve specific blob by single hash', async () => {
      // We can also request a single blob by its hash
      const getResponse = await request(service.getApp()).get(`/blobs?blobHashes=${blobHashes[1]}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.length).toBe(1);

      const retrievedBlobs = getResponse.body.data;
      const retrievedBlob = Blob.fromBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      expect(retrievedBlob).toEqual(blob1);
    });

    it('should retrieve first blob by its hash', async () => {
      const getResponse = await request(service.getApp()).get(`/blobs?blobHashes=${blobHashes[0]}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.length).toBe(1);

      const retrievedBlobs = getResponse.body.data;
      const retrievedBlob = Blob.fromBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      expect(retrievedBlob).toEqual(blob0);
    });
  });

  describe('errors', () => {
    beforeEach(() => startServer());

    it('should return an error if blobHashes parameter is missing', async () => {
      const response = await request(service.getApp()).get('/blobs');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing or invalid blobHashes query parameter');
    });

    it('should return an error if invalid blob hash format is provided', async () => {
      const response = await request(service.getApp()).get('/blobs?blobHashes=invalid-hash');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid blob hash: invalid-hash');
    });

    it('should return an error if blobs parameter is missing (POST)', async () => {
      const response = await request(service.getApp()).post('/blobs').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid blob data');
    });

    it('should return an error if blobs parameter is not an array (POST)', async () => {
      const response = await request(service.getApp()).post('/blobs').send({
        blobs: 'not-an-array',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid blob data');
    });

    it('should return 404 for non-existent blob hashes', async () => {
      const nonExistentHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(service.getApp()).get(`/blobs?blobHashes=${nonExistentHash}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('No blobs found');
    });

    it('should reject blob hashes that are too short', async () => {
      const shortHash = '0x1234';
      const response = await request(service.getApp()).get(`/blobs?blobHashes=${shortHash}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(`Invalid blob hash: ${shortHash}`);
    });
  });
});
