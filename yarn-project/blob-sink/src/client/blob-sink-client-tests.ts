import { makeEncodedBlob } from '@aztec/blob-lib/testing';

import type { BlobSinkClientInterface } from './interface.js';

/**
 * Shared test suite for blob sink clients
 * @param createClient - Function that creates a client instance for testing
 * @param cleanup - Optional cleanup function to run after each test
 */
export function runBlobSinkClientTests(
  createClient: () => Promise<{ client: BlobSinkClientInterface; cleanup: () => Promise<void> }>,
) {
  let client: BlobSinkClientInterface;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createClient();
    client = setup.client;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should send and retrieve blobs', async () => {
    const blob = await makeEncodedBlob(3);
    const blobHash = blob.getEthVersionedBlobHash();
    const blockId = '0x1234';

    const success = await client.sendBlobsToBlobSink(blockId, [blob]);
    expect(success).toBe(true);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHash]);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0].blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlobs[0].blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
  });

  it('should handle multiple blobs', async () => {
    const blobs = await Promise.all([makeEncodedBlob(2), makeEncodedBlob(2), makeEncodedBlob(2)]);
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());
    const blockId = '0x5678';

    const success = await client.sendBlobsToBlobSink(blockId, blobs);
    expect(success).toBe(true);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs).toHaveLength(3);

    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i].blob.fieldsHash.toString()).toBe(blobs[i].fieldsHash.toString());
      expect(retrievedBlobs[i].blob.commitment.toString('hex')).toBe(blobs[i].commitment.toString('hex'));
    }

    // Can request blobs by index
    const retrievedBlobsByIndex = await client.getBlobSidecar(blockId, blobHashes, [0, 2]);
    expect(retrievedBlobsByIndex).toHaveLength(2);
    expect(retrievedBlobsByIndex[0].blob.fieldsHash.toString()).toBe(blobs[0].fieldsHash.toString());
    expect(retrievedBlobsByIndex[1].blob.fieldsHash.toString()).toBe(blobs[2].fieldsHash.toString());
  });

  it('should return empty array for non-existent block', async () => {
    const blockId = '0xnonexistent';
    const retrievedBlobs = await client.getBlobSidecar(blockId, [Buffer.from([0x0])]);
    expect(retrievedBlobs).toEqual([]);
  });
}
