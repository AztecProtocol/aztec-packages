import { Blob } from '@aztec/blob-lib';
import { Fr } from '@aztec/foundation/curves/bn254';

import type { BlobStore } from './interface.js';

export function describeBlobStore(getBlobStore: () => Promise<BlobStore>) {
  let blobStore: BlobStore;

  beforeEach(async () => {
    blobStore = await getBlobStore();
  });

  it('should store and retrieve a blob by hash', async () => {
    // Create a test blob with random fields
    const testFields = [Fr.random(), Fr.random(), Fr.random()];
    const blob = Blob.fromFields(testFields);
    const blobHash = blob.getEthVersionedBlobHash();

    // Store the blob
    await blobStore.addBlobs([blob]);

    // Retrieve the blob by hash
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash]);

    // Verify the blob was retrieved and matches
    expect(retrievedBlobs.length).toBe(1);
    expect(retrievedBlobs[0]).toEqual(blob);
  });

  it('should handle multiple blobs stored and retrieved by their hashes', async () => {
    // Create two different blobs
    const blob1 = Blob.fromFields([Fr.random(), Fr.random()]);
    const blob2 = Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]);

    const blobHash1 = blob1.getEthVersionedBlobHash();
    const blobHash2 = blob2.getEthVersionedBlobHash();

    // Store both blobs
    await blobStore.addBlobs([blob1, blob2]);

    // Retrieve and verify both blobs
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash1, blobHash2]);

    expect(retrievedBlobs.length).toBe(2);
    expect(retrievedBlobs[0]).toEqual(blob1);
    expect(retrievedBlobs[1]).toEqual(blob2);
  });

  it('should return empty array for non-existent blob hash', async () => {
    // Create a random hash that doesn't exist
    const nonExistentHash = Buffer.alloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await blobStore.getBlobsByHashes([nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  it('should handle retrieving subset of stored blobs', async () => {
    // Store multiple blobs
    const blob1 = Blob.fromFields([Fr.random()]);
    const blob2 = Blob.fromFields([Fr.random()]);
    const blob3 = Blob.fromFields([Fr.random()]);

    await blobStore.addBlobs([blob1, blob2, blob3]);

    // Retrieve only some of them
    const blobHash1 = blob1.getEthVersionedBlobHash();
    const blobHash3 = blob3.getEthVersionedBlobHash();

    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash1, blobHash3]);

    expect(retrievedBlobs.length).toBe(2);
    expect(retrievedBlobs[0]).toEqual(blob1);
    expect(retrievedBlobs[1]).toEqual(blob3);
  });

  it('should handle duplicate blob hashes in request', async () => {
    const blob = Blob.fromFields([Fr.random()]);
    const blobHash = blob.getEthVersionedBlobHash();

    await blobStore.addBlobs([blob]);

    // Request the same blob hash multiple times
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash, blobHash]);

    // Implementation may return duplicates or deduplicate - both are valid
    expect(retrievedBlobs.length).toBeGreaterThanOrEqual(1);
    expect(retrievedBlobs[0]).toEqual(blob);
  });

  it('should overwrite blob when storing with same hash', async () => {
    // Create two blobs that will have the same hash (same content)
    const fields = [Fr.random(), Fr.random()];
    const blob1 = Blob.fromFields(fields);
    const blob2 = Blob.fromFields(fields);

    const blobHash = blob1.getEthVersionedBlobHash();

    // Store first blob
    await blobStore.addBlobs([blob1]);

    // Overwrite with second blob (same hash)
    await blobStore.addBlobs([blob2]);

    // Retrieve and verify it exists
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash]);
    expect(retrievedBlobs.length).toBe(1);
    expect(retrievedBlobs[0]).toEqual(blob1); // Same content
  });
}
