import { makeRandomBlob } from '@aztec/blob-lib/testing';

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
    const blob = makeRandomBlob(3);
    const blobHash = blob.getEthVersionedBlobHash();

    await client.sendBlobsToBlobSink([blob]);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHash]);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0].blob).toEqual(blob);
  });

  it('should handle multiple blobs', async () => {
    const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToBlobSink(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs).toHaveLength(3);

    expect(retrievedBlobs.map(b => b.blob)).toEqual(blobs);
  });

  it('should return empty array for non-existent blob hash', async () => {
    const nonExistentHash = Buffer.alloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  it('should preserve blob indices', async () => {
    const blobs = Array.from({ length: 3 }, () => makeRandomBlob(3));
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    // Indices should be assigned sequentially based on the order they were sent
    await client.sendBlobsToBlobSink(blobs);

    // Retrieve the blobs by hash in random order
    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHashes[2], blobHashes[0], blobHashes[1]]);
    expect(retrievedBlobs).toHaveLength(3);

    expect(retrievedBlobs[0].index).toBe(2);
    expect(retrievedBlobs[1].index).toBe(0);
    expect(retrievedBlobs[2].index).toBe(1);
  });
}
