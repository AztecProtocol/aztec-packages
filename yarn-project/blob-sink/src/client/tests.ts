import { Blob, FIELDS_PER_BLOB } from '@aztec/blob-lib';
import { makeEncodedBlob, makeEncodedBlobFields, makeEncodedBlobs } from '@aztec/blob-lib/testing';

import type { Hex } from 'viem';

import type { BlobSinkClientInterface } from './interface.js';

/**
 * Shared test suite for blob sink clients
 * @param createClient - Function that creates a client instance for testing
 * @param cleanup - Optional cleanup function to run after each test
 */
export function runBlobSinkClientTests(
  createClient: () => Promise<{ client: BlobSinkClientInterface; cleanup: () => Promise<void> }>,
) {
  let blockId: Hex;
  let client: BlobSinkClientInterface;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    blockId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const setup = await createClient();
    client = setup.client;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should send and retrieve blobs by hash', async () => {
    const blob = await makeEncodedBlob(3);
    const blobHash = blob.getEthVersionedBlobHash();

    await client.sendBlobsToBlobSink([blob]);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHash]);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0].blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlobs[0].blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
  });

  it('should handle multiple blobs', async () => {
    // Create 2 full blobs and 1 partially-filled blob.
    const blobFields = makeEncodedBlobFields(2 * FIELDS_PER_BLOB + 123);
    const fieldsHash = await Blob.getFieldsHash(blobFields);
    const blobs = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        Blob.fromFields(blobFields.slice(i * FIELDS_PER_BLOB, (i + 1) * FIELDS_PER_BLOB), fieldsHash),
      ),
    );
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToBlobSink(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs).toHaveLength(3);

    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i].blob.fieldsHash.toString()).toBe(fieldsHash.toString());
      expect(retrievedBlobs[i].blob.commitment.toString('hex')).toBe(blobs[i].commitment.toString('hex'));
    }
  });

  it('should return empty array for non-existent blob hash', async () => {
    const nonExistentHash = Buffer.alloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  it('should preserve blob indices', async () => {
    const blobs = await makeEncodedBlobs(2 * FIELDS_PER_BLOB);
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToBlobSink(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs).toHaveLength(2);

    // Indices should be assigned sequentially based on the order they were sent
    expect(retrievedBlobs[0].index).toBe(0);
    expect(retrievedBlobs[1].index).toBe(1);
  });
}
