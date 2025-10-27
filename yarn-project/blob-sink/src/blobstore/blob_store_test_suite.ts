import { Blob } from '@aztec/blob-lib';
import { Fr } from '@aztec/foundation/fields';

import { BlobWithIndex } from '../types/index.js';
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
    const blobWithIndex = new BlobWithIndex(blob, 0);
    const blobHash = blob.getEthVersionedBlobHash();

    // Store the blob
    await blobStore.addBlobs([blobWithIndex]);

    // Retrieve the blob by hash
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash]);

    // Verify the blob was retrieved and matches
    expect(retrievedBlobs.length).toBe(1);
    expect(retrievedBlobs[0].blob).toEqual(blob);
  });

  it('should handle multiple blobs stored and retrieved by their hashes', async () => {
    // Create two different blobs
    const blob1 = Blob.fromFields([Fr.random(), Fr.random()]);
    const blob2 = Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]);
    const blobWithIndex1 = new BlobWithIndex(blob1, 0);
    const blobWithIndex2 = new BlobWithIndex(blob2, 1);

    const blobHash1 = blob1.getEthVersionedBlobHash();
    const blobHash2 = blob2.getEthVersionedBlobHash();

    // Store both blobs
    await blobStore.addBlobs([blobWithIndex1, blobWithIndex2]);

    // Retrieve and verify both blobs
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash1, blobHash2]);

    expect(retrievedBlobs.length).toBe(2);
    expect(retrievedBlobs[0].blob).toEqual(blob1);
    expect(retrievedBlobs[1].blob).toEqual(blob2);
  });

  it('should return empty array for non-existent blob hash', async () => {
    // Create a random hash that doesn't exist
    const nonExistentHash = Buffer.alloc(32);
    nonExistentHash.fill(0xff);

    const retrievedBlobs = await blobStore.getBlobsByHashes([nonExistentHash]);
    expect(retrievedBlobs).toEqual([]);
  });

  it('should handle storing blobs with different indices', async () => {
    // Create blobs with different indices
    const blob1 = Blob.fromFields([Fr.random()]);
    const blob2 = Blob.fromFields([Fr.random()]);
    const blobWithIndex1 = new BlobWithIndex(blob1, 0);
    const blobWithIndex2 = new BlobWithIndex(blob2, 1);

    await blobStore.addBlobs([blobWithIndex1, blobWithIndex2]);

    const blobHash1 = blob1.getEthVersionedBlobHash();
    const blobHash2 = blob2.getEthVersionedBlobHash();

    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash1, blobHash2]);

    expect(retrievedBlobs[0].index).toBe(0);
    expect(retrievedBlobs[1].index).toBe(1);
  });

  it('should handle retrieving subset of stored blobs', async () => {
    // Store multiple blobs
    const blob1 = Blob.fromFields([Fr.random()]);
    const blob2 = Blob.fromFields([Fr.random()]);
    const blob3 = Blob.fromFields([Fr.random()]);

    await blobStore.addBlobs([new BlobWithIndex(blob1, 0), new BlobWithIndex(blob2, 1), new BlobWithIndex(blob3, 2)]);

    // Retrieve only some of them
    const blobHash1 = blob1.getEthVersionedBlobHash();
    const blobHash3 = blob3.getEthVersionedBlobHash();

    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash1, blobHash3]);

    expect(retrievedBlobs.length).toBe(2);
    expect(retrievedBlobs[0].blob).toEqual(blob1);
    expect(retrievedBlobs[1].blob).toEqual(blob3);
  });

  it('should handle duplicate blob hashes in request', async () => {
    const blob = Blob.fromFields([Fr.random()]);
    const blobWithIndex = new BlobWithIndex(blob, 0);
    const blobHash = blob.getEthVersionedBlobHash();

    await blobStore.addBlobs([blobWithIndex]);

    // Request the same blob hash multiple times
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash, blobHash]);

    // Implementation may return duplicates or deduplicate - both are valid
    expect(retrievedBlobs.length).toBeGreaterThanOrEqual(1);
    expect(retrievedBlobs[0].blob).toEqual(blob);
  });

  it('should overwrite blob when storing with same hash', async () => {
    // Create two blobs that will have the same hash (same content)
    const fields = [Fr.random(), Fr.random()];
    const blob1 = Blob.fromFields(fields);
    const blob2 = Blob.fromFields(fields);

    // Store with different indices
    const blobWithIndex1 = new BlobWithIndex(blob1, 0);
    const blobWithIndex2 = new BlobWithIndex(blob2, 5);

    const blobHash = blob1.getEthVersionedBlobHash();

    // Store first blob
    await blobStore.addBlobs([blobWithIndex1]);

    // Overwrite with second blob (same hash, different index)
    await blobStore.addBlobs([blobWithIndex2]);

    // Retrieve and verify it's the second blob (with index 5)
    const retrievedBlobs = await blobStore.getBlobsByHashes([blobHash]);
    expect(retrievedBlobs.length).toBe(1);
    expect(retrievedBlobs[0].index).toBe(5);
  });
}
