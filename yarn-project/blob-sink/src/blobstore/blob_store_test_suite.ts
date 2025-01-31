import { Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import { BlobWithIndex } from '../types/index.js';
import { type BlobStore } from './interface.js';

export function describeBlobStore(getBlobStore: () => BlobStore) {
  let blobStore: BlobStore;

  beforeEach(() => {
    blobStore = getBlobStore();
  });

  it('should store and retrieve a blob', async () => {
    // Create a test blob with random fields
    const testFields = [Fr.random(), Fr.random(), Fr.random()];
    const blob = await Blob.fromFields(testFields);
    const blockId = '0x12345';
    const blobWithIndex = new BlobWithIndex(blob, 0);

    // Store the blob
    await blobStore.addBlobSidecars(blockId, [blobWithIndex]);

    // Retrieve the blob
    const retrievedBlobs = await blobStore.getBlobSidecars(blockId);
    const [retrievedBlob] = retrievedBlobs!;

    // Verify the blob was retrieved and matches
    expect(retrievedBlob).toBeDefined();
    expect(retrievedBlob.blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlob.blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
  });

  it('Should allow requesting a specific index of blob', async () => {
    const testFields = [Fr.random(), Fr.random(), Fr.random()];
    const blob = await Blob.fromFields(testFields);
    const blockId = '0x12345';
    const blobWithIndex = new BlobWithIndex(blob, 0);
    const blobWithIndex2 = new BlobWithIndex(blob, 1);

    await blobStore.addBlobSidecars(blockId, [blobWithIndex, blobWithIndex2]);

    const retrievedBlobs = await blobStore.getBlobSidecars(blockId, [0]);
    const [retrievedBlob] = retrievedBlobs!;

    expect(retrievedBlob.blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlob.blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));

    const retrievedBlobs2 = await blobStore.getBlobSidecars(blockId, [1]);
    const [retrievedBlob2] = retrievedBlobs2!;

    expect(retrievedBlob2.blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlob2.blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));
  });

  it('Differentiate between blockHash and slot', async () => {
    const testFields = [Fr.random(), Fr.random(), Fr.random()];
    const testFieldsSlot = [Fr.random(), Fr.random(), Fr.random()];
    const blob = await Blob.fromFields(testFields);
    const blobSlot = await Blob.fromFields(testFieldsSlot);
    const blockId = '0x12345';
    const slot = '12345';
    const blobWithIndex = new BlobWithIndex(blob, 0);
    const blobWithIndexSlot = new BlobWithIndex(blobSlot, 0);

    await blobStore.addBlobSidecars(blockId, [blobWithIndex]);
    await blobStore.addBlobSidecars(slot, [blobWithIndexSlot]);

    const retrievedBlobs = await blobStore.getBlobSidecars(blockId, [0]);
    const [retrievedBlob] = retrievedBlobs!;

    expect(retrievedBlob.blob.fieldsHash.toString()).toBe(blob.fieldsHash.toString());
    expect(retrievedBlob.blob.commitment.toString('hex')).toBe(blob.commitment.toString('hex'));

    const retrievedBlobs2 = await blobStore.getBlobSidecars(slot, [0]);
    const [retrievedBlob2] = retrievedBlobs2!;

    expect(retrievedBlob2.blob.fieldsHash.toString()).toBe(blobSlot.fieldsHash.toString());
    expect(retrievedBlob2.blob.commitment.toString('hex')).toBe(blobSlot.commitment.toString('hex'));
  });

  it('should return undefined for non-existent blob', async () => {
    const nonExistentBlob = await blobStore.getBlobSidecars('999999');
    expect(nonExistentBlob).toBeUndefined();
  });

  it('should handle multiple blobs with different block IDs', async () => {
    // Create two different blobs
    const blob1 = await Blob.fromFields([Fr.random(), Fr.random()]);
    const blob2 = await Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]);
    const blobWithIndex1 = new BlobWithIndex(blob1, 0);
    const blobWithIndex2 = new BlobWithIndex(blob2, 0);

    // Store both blobs
    await blobStore.addBlobSidecars('1', [blobWithIndex1]);
    await blobStore.addBlobSidecars('2', [blobWithIndex2]);

    // Retrieve and verify both blobs
    const retrieved1 = await blobStore.getBlobSidecars('1');
    const retrieved2 = await blobStore.getBlobSidecars('2');
    const [retrievedBlob1] = retrieved1!;
    const [retrievedBlob2] = retrieved2!;

    expect(retrievedBlob1.blob.commitment.toString('hex')).toBe(blob1.commitment.toString('hex'));
    expect(retrievedBlob2.blob.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
  });

  it('should overwrite blob when using same block ID', async () => {
    // Create two different blobs
    const originalBlob = await Blob.fromFields([Fr.random()]);
    const newBlob = await Blob.fromFields([Fr.random(), Fr.random()]);
    const blockId = '1';
    const originalBlobWithIndex = new BlobWithIndex(originalBlob, 0);
    const newBlobWithIndex = new BlobWithIndex(newBlob, 0);

    // Store original blob
    await blobStore.addBlobSidecars(blockId, [originalBlobWithIndex]);

    // Overwrite with new blob
    await blobStore.addBlobSidecars(blockId, [newBlobWithIndex]);

    // Retrieve and verify it's the new blob
    const retrievedBlobs = await blobStore.getBlobSidecars(blockId);
    const [retrievedBlob] = retrievedBlobs!;
    expect(retrievedBlob.blob.commitment.toString('hex')).toBe(newBlob.commitment.toString('hex'));
    expect(retrievedBlob.blob.commitment.toString('hex')).not.toBe(originalBlob.commitment.toString('hex'));
  });

  it('should handle multiple blobs with the same block ID', async () => {
    const blob1 = await Blob.fromFields([Fr.random()]);
    const blob2 = await Blob.fromFields([Fr.random()]);
    const blobWithIndex1 = new BlobWithIndex(blob1, 0);
    const blobWithIndex2 = new BlobWithIndex(blob2, 0);

    await blobStore.addBlobSidecars('1', [blobWithIndex1, blobWithIndex2]);
    const retrievedBlobs = await blobStore.getBlobSidecars('1');
    const [retrievedBlob1, retrievedBlob2] = retrievedBlobs!;

    expect(retrievedBlob1.blob.commitment.toString('hex')).toBe(blob1.commitment.toString('hex'));
    expect(retrievedBlob2.blob.commitment.toString('hex')).toBe(blob2.commitment.toString('hex'));
  });
}
