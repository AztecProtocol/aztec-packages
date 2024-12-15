import { makeTuple } from '@aztec/foundation/array';
import { toBigIntBE, toBufferBE, toHex } from '@aztec/foundation/bigint-buffer';
import { type Blob } from '@aztec/foundation/blob';
import { sha256, sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { BLOBS_PER_BLOCK } from '../constants.gen.js';

// The prefix to the EVM blobHash, defined here: https://eips.ethereum.org/EIPS/eip-4844#specification
// Also defined in yarn-project/foundation/src/blob/index.ts, which can't take in our circuits.js constants
export const VERSIONED_HASH_VERSION_KZG = 0x01;

/**
 * Public inputs required to be passed from our rollup circuits to verify a blob.
 */
export class BlobPublicInputs {
  constructor(
    /** Challenge point z (= H(H(tx_effects), kzgCommmitment). */
    public z: Fr,
    /** Evaluation y = p(z), where p() is the blob polynomial. */
    public y: bigint,
    /** Commitment to the blob C. */
    public kzgCommitment: Tuple<Fr, 2>,
  ) {}

  static empty(): BlobPublicInputs {
    return new BlobPublicInputs(Fr.ZERO, 0n, [Fr.ZERO, Fr.ZERO]);
  }

  isEmpty(): boolean {
    return this.z.isZero() && this.y == 0n && this.kzgCommitment[0].isZero() && this.kzgCommitment[1].isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlobPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlobPublicInputs(Fr.fromBuffer(reader), toBigIntBE(reader.readBytes(32)), reader.readArray(2, Fr));
  }

  toBuffer() {
    return serializeToBuffer(...BlobPublicInputs.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): BlobPublicInputs {
    const reader = FieldReader.asReader(fields);
    // TODO: Create a BigNum to fields conversion we can use here and in type_conversion.ts
    const fromBigNum = (fieldArr: Fr[]) => {
      return BigInt(
        fieldArr[2].toString().concat(fieldArr[1].toString().substring(2), fieldArr[0].toString().substring(2)),
      );
    };
    return new BlobPublicInputs(reader.readField(), fromBigNum(reader.readFieldArray(3)), reader.readFieldArray(2));
  }

  // NB: y is NOT a BN254 field, it's a larger BLS field, we cannot use serialiseToFields here as it assumes bigints will fit
  // TODO: Create a BigNum to fields conversion we can use here and in type_conversion.ts
  toFields() {
    const hex = toHex(this.y, true);
    const bigNum = [
      Fr.fromString('0x' + hex.substring(36)),
      Fr.fromString('0x' + hex.substring(6, 36)),
      Fr.fromString(hex.substring(0, 6)),
    ];
    return [this.z, ...bigNum, ...this.kzgCommitment];
  }

  static getFields(fields: FieldsOf<BlobPublicInputs>) {
    return [fields.z, fields.y, fields.kzgCommitment] as const;
  }

  static fromBlob(input: Blob): BlobPublicInputs {
    return new BlobPublicInputs(input.challengeZ, toBigIntBE(input.evaluationY), input.commitmentToFields());
  }

  getBlobHash(): Buffer {
    const hash = sha256(this.commitmentToBuffer());
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  // Performs the reverse conversion of blob.commitmentToFields()
  // 48 bytes encoded in fields as [Fr, Fr] = [0->31, 31->48]
  commitmentToBuffer(): Buffer {
    return Buffer.concat([
      this.kzgCommitment[0].toBuffer().subarray(1),
      this.kzgCommitment[1].toBuffer().subarray(-17),
    ]);
  }

  equals(other: BlobPublicInputs) {
    return (
      this.z.equals(other.z) &&
      this.y == other.y &&
      this.kzgCommitment[0].equals(other.kzgCommitment[0]) &&
      this.kzgCommitment[1].equals(other.kzgCommitment[1])
    );
  }
}

// NB: it is much cleaner throughout the protocol circuits to define this struct rather than use a nested array.
// Once we accumulate blob inputs, it should be removed, and we just use BlobPublicInputs::accumulate everywhere.
export class BlockBlobPublicInputs {
  constructor(public inner: Tuple<BlobPublicInputs, typeof BLOBS_PER_BLOCK>) {}

  static empty(): BlockBlobPublicInputs {
    return new BlockBlobPublicInputs(makeTuple(BLOBS_PER_BLOCK, BlobPublicInputs.empty));
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockBlobPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlockBlobPublicInputs(reader.readArray(BLOBS_PER_BLOCK, BlobPublicInputs));
  }

  toBuffer() {
    return serializeToBuffer(...BlockBlobPublicInputs.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): BlockBlobPublicInputs {
    const reader = FieldReader.asReader(fields);
    return new BlockBlobPublicInputs(reader.readArray(BLOBS_PER_BLOCK, BlobPublicInputs));
  }

  toFields() {
    return this.inner.map(i => i.toFields()).flat();
  }

  static getFields(fields: FieldsOf<BlockBlobPublicInputs>) {
    return [fields.inner] as const;
  }

  static fromBlobs(inputs: Blob[]): BlockBlobPublicInputs {
    const inner = makeTuple(BLOBS_PER_BLOCK, BlobPublicInputs.empty);
    if (inputs.length > BLOBS_PER_BLOCK) {
      throw new Error(`Can only fit ${BLOBS_PER_BLOCK} in one BlockBlobPublicInputs instance (given ${inputs.length})`);
    }
    inputs.forEach((input, i) => {
      inner[i] = BlobPublicInputs.fromBlob(input);
    });
    return new BlockBlobPublicInputs(inner);
  }

  getBlobsHash() {
    const blobHashes = this.inner.map(item => (item.isEmpty() ? Buffer.alloc(0) : item.getBlobHash()));
    return sha256Trunc(serializeToBuffer(blobHashes));
  }

  // The below is used to send to L1 for proof verification
  toString() {
    const nonEmptyBlobs = this.inner.filter(item => !item.isEmpty());
    // Write the number of blobs for L1 to verify
    let buf = Buffer.alloc(1);
    buf.writeUInt8(nonEmptyBlobs.length);
    // Using standard toBuffer() does not correctly encode the commitment
    // On L1, it's a 48 byte number, which we convert to 2 fields for use in the circuits
    nonEmptyBlobs.forEach(blob => {
      buf = Buffer.concat([buf, blob.z.toBuffer(), toBufferBE(blob.y, 32), blob.commitmentToBuffer()]);
    });
    return buf.toString('hex');
  }
}
