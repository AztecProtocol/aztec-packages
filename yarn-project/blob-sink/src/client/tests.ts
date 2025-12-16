import { FIELDS_PER_BLOB } from '@aztec/blob-lib';
import { makeEncodedBlob, makeEncodedBlobs } from '@aztec/blob-lib/testing';

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
    const blob = makeEncodedBlob(5);
    const blobHash = blob.getEthVersionedBlobHash();

    await client.sendBlobsToBlobSink([blob]);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHash]);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0].blob).toEqual(blob);
  });

  it('should handle multiple blobs', async () => {
    const blobs = makeEncodedBlobs(3 * FIELDS_PER_BLOB);
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToBlobSink(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs.length).toBe(3);

    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i].blob).toEqual(blobs[i]);
    }
  });

  it('should return empty array for non-existent blob hash', async () => {
    const nonExistentHash = Buffer.alloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  it('should preserve blob indices', async () => {
    const blobs = makeEncodedBlobs(3 * FIELDS_PER_BLOB);
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToBlobSink(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs.length).toBe(blobs.length);

    // Indices should be assigned sequentially based on the order they were sent
    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i].blob).toEqual(blobs[i]);
      expect(retrievedBlobs[i].index).toBe(i);
    }
  });
}
