import { Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import request from 'supertest';

import { BlobSinkServer } from './server.js';

describe('BlobSinkService', () => {
  let service: BlobSinkServer;

  beforeEach(async () => {
    service = new BlobSinkServer({
      port: 0, // Using port 0 lets the OS assign a random available port
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should store and retrieve a blob sidecar', async () => {
    // Create a test blob
    const testFields = [Fr.random(), Fr.random(), Fr.random()];
    const blob = Blob.fromFields(testFields);
    const blockId = '0x1234';

    // Post the blob
    const postResponse = await request(service.getApp())
      .post('/blob_sidecar')
      .send({
        // eslint-disable-next-line camelcase
        block_id: blockId,
        blobs: [
          {
            index: 0,
            blob: blob.toBuffer(),
          },
        ],
      });

    expect(postResponse.status).toBe(200);

    // Retrieve the blob
    const getResponse = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}`);

    expect(getResponse.status).toBe(200);

    // Convert the response blob back to a Blob object and verify it matches
    const retrievedBlobs = getResponse.body.data;

    const retrievedBlob = Blob.fromBuffer(Buffer.from(retrievedBlobs[0].blob, 'hex'));
    expect(retrievedBlob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
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

  it('should reject invalid block IDs', async () => {
    const response = await request(service.getApp()).get('/eth/v1/beacon/blob_sidecars/invalid-id');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid block_id parameter');
  });

  it('should reject negative block IDs', async () => {
    const response = await request(service.getApp()).get('/eth/v1/beacon/blob_sidecars/-123');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid block_id parameter');
  });
});
