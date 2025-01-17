import { Blob, makeEncodedBlob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import { type BlobSinkClientInterface } from './interface.js';

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
    const blob = makeEncodedBlob(3);
    const blockId = '0x1234';

    const success = await client.sendBlobsToBlobSink(blockId, [blob]);
    expect(success).toBe(true);

    const retrievedBlobs = await client.getBlobSidecar(blockId);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0].fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlobs[0].commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
  });

  it('should handle multiple blobs', async () => {
    const blobs = [makeEncodedBlob(2), makeEncodedBlob(2), makeEncodedBlob(2)];
    const blockId = '0x5678';

    const success = await client.sendBlobsToBlobSink(blockId, blobs);
    expect(success).toBe(true);

    const retrievedBlobs = await client.getBlobSidecar(blockId);
    expect(retrievedBlobs).toHaveLength(3);

    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i].fieldsHash.toString()).toBe(blobs[i].fieldsHash.toString());
      expect(retrievedBlobs[i].commitment.toString('hex')).toBe(blobs[i].commitment.toString('hex'));
    }

    // Can request blobs by index
    const retrievedBlobsByIndex = await client.getBlobSidecar(blockId, [0, 2]);
    expect(retrievedBlobsByIndex).toHaveLength(2);
    expect(retrievedBlobsByIndex[0].fieldsHash.toString()).toBe(blobs[0].fieldsHash.toString());
    expect(retrievedBlobsByIndex[1].fieldsHash.toString()).toBe(blobs[2].fieldsHash.toString());
  });

  it('should return empty array for non-existent block', async () => {
    const blockId = '0xnonexistent';
    const retrievedBlobs = await client.getBlobSidecar(blockId);
    expect(retrievedBlobs).toEqual([]);
  });
}
