import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { bufferAlloc } from '@aztec/foundation/buffer';

import type { Hex } from 'viem';

import type { BlobClientInterface } from './interface.js';

/**
 * Shared test suite for blob clients
 * @param createClient - Function that creates a client instance for testing
 * @param cleanup - Optional cleanup function to run after each test
 */
export function runBlobClientTests(
  createClient: () => Promise<{ client: BlobClientInterface; cleanup: () => Promise<void> }>,
) {
  let blockId: Hex;
  let client: BlobClientInterface;
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
    const blob = makeRandomBlob(5);
    const blobHash = blob.getEthVersionedBlobHash();

    await client.sendBlobsToFilestore([blob]);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [blobHash]);
    expect(retrievedBlobs).toHaveLength(1);
    expect(retrievedBlobs[0]).toEqual(blob);
  });

  it('should handle multiple blobs', async () => {
    const blobs = Array.from({ length: 3 }, () => makeRandomBlob(7));
    const blobHashes = blobs.map(blob => blob.getEthVersionedBlobHash());

    await client.sendBlobsToFilestore(blobs);

    const retrievedBlobs = await client.getBlobSidecar(blockId, blobHashes);
    expect(retrievedBlobs.length).toBe(3);

    for (let i = 0; i < blobs.length; i++) {
      expect(retrievedBlobs[i]).toEqual(blobs[i]);
    }
  });

  it('should return empty array for non-existent blob hash', async () => {
    const nonExistentHash = bufferAlloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await client.getBlobSidecar(blockId, [nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });
}
