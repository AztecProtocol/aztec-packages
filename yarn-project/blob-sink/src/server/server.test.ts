import { Blob, makeEncodedBlob } from '@aztec/foundation/blob';

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

  describe('should store and retrieve a blob sidecar', () => {
    const blob = makeEncodedBlob(3);
    const blob2 = makeEncodedBlob(3);
    const blockId = '0x1234';

    beforeEach(async () => {
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
            {
              index: 1,
              blob: blob2.toBuffer(),
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
      const retrievedBlob = Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      const retrievedBlob2 = Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[1].blob.slice(2), 'hex'));

      expect(retrievedBlob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
      expect(retrievedBlob.proof.toString('hex')).toBe(blob.proof.toString('hex'));

      expect(retrievedBlob2.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob2.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob2.proof.toString('hex')).toBe(blob2.proof.toString('hex'));
    });

    it('should retrieve specific indicies', async () => {
      // We can also request specific indicies
      const getWithIndicies = await request(service.getApp()).get(
        `/eth/v1/beacon/blob_sidecars/${blockId}?indices=0,1`,
      );

      expect(getWithIndicies.status).toBe(200);
      expect(getWithIndicies.body.data.length).toBe(2);

      const retrievedBlobs = getWithIndicies.body.data;
      const retrievedBlob = Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      const retrievedBlob2 = Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[1].blob.slice(2), 'hex'));
      expect(retrievedBlob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
      expect(retrievedBlob.proof.toString('hex')).toBe(blob.proof.toString('hex'));

      expect(retrievedBlob2.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob2.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob2.proof.toString('hex')).toBe(blob2.proof.toString('hex'));
    });

    it('should retreive a single index', async () => {
      const getWithIndicies = await request(service.getApp()).get(`/eth/v1/beacon/blob_sidecars/${blockId}?indices=1`);

      expect(getWithIndicies.status).toBe(200);
      expect(getWithIndicies.body.data.length).toBe(1);

      const retrievedBlobs = getWithIndicies.body.data;
      const retrievedBlob = Blob.fromEncodedBlobBuffer(Buffer.from(retrievedBlobs[0].blob.slice(2), 'hex'));
      expect(retrievedBlob.fieldsHash.toString()).toBe(blob2.fieldsHash.toString());
      expect(retrievedBlob.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
      expect(retrievedBlob.proof.toString('hex')).toBe(blob2.proof.toString('hex'));
    });
  });

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
