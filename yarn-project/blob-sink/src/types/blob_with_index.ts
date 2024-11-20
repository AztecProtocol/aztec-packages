import { Blob } from '@aztec/foundation/blob';
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
  public toJSON(): { blob: string; index: number; kzg_commitment: string; kzg_proof: string } {
    return {
      blob: this.blob.toBuffer().toString('hex'),
      index: this.index,
      // eslint-disable-next-line camelcase
      kzg_commitment: this.blob.commitment.toString('hex'),
      // eslint-disable-next-line camelcase
      kzg_proof: this.blob.proof.toString('hex'),
    };
  }
}
