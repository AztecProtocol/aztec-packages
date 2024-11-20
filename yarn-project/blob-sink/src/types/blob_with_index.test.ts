import { Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import { BlobWithIndex, BlobsWithIndexes } from './blob_with_index.js';

describe('BlobWithIndex Serde', () => {
  it('should serialize and deserialize', () => {
    const blob = Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]);
    const blobWithIndex = new BlobWithIndex(blob, 0);
    const serialized = blobWithIndex.toBuffer();

    const deserialized = BlobWithIndex.fromBuffer(serialized);

    expect(blobWithIndex).toEqual(deserialized);
  });
});

describe('BlobsWithIndexes Serde', () => {
  it('should serialize and deserialize', () => {
    const blobs = [
      new BlobWithIndex(Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]), 0),
      new BlobWithIndex(Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]), 1),
    ];
    const blobsWithIndexes = new BlobsWithIndexes(blobs);

    const serialized = blobsWithIndexes.toBuffer();
    const deserialized = BlobsWithIndexes.fromBuffer(serialized);

    expect(deserialized).toEqual(blobsWithIndexes);
  });
});
