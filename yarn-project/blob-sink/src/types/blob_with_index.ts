import { Blob, type BlobJson } from '@aztec/foundation/blob';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/** Serialized an array of blobs with their indexes to be stored at a given block id */
export class BlobsWithIndexes {
  constructor(public blobs: BlobWithIndex[]) {}

  public toBuffer(): Buffer {
    return serializeToBuffer(this.blobs.length, this.blobs);
  }

  public static fromBuffer(buffer: Buffer | BufferReader): BlobsWithIndexes {
    const reader = BufferReader.asReader(buffer);
    return new BlobsWithIndexes(reader.readArray(reader.readNumber(), BlobWithIndex));
  }

  public getBlobsFromIndices(indices: number[]): BlobWithIndex[] {
    return this.blobs.filter((_, index) => indices.includes(index));
  }
}

/** We store blobs alongside their index in the block */
export class BlobWithIndex {
  constructor(
    /** The blob */
    public blob: Blob,
    /** The index of the blob in the block */
    public index: number,
  ) {}

  public toBuffer(): Buffer {
    return serializeToBuffer([this.blob, this.index]);
  }

  public static fromBuffer(buffer: Buffer | BufferReader): BlobWithIndex {
    const reader = BufferReader.asReader(buffer);
    return new BlobWithIndex(reader.readObject(Blob), reader.readNumber());
  }

  // Follows the structure the beacon node api expects
  public toJSON(): BlobJson {
    return this.blob.toJson(this.index);
  }
}
