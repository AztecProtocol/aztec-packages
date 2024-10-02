import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { type Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

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

  static fromBuffer(buffer: Buffer | BufferReader): BlobPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlobPublicInputs(Fr.fromBuffer(reader), toBigIntBE(reader.readBytes(32)), reader.readArray(2, Fr));
  }

  // static fromFields(fields: Fr[] | FieldReader): BlobPublicInputs {
  //   const reader = FieldReader.asReader(fields);

  //   return new BlobPublicInputs(
  //     reader.readField(),
  //     reader.readField().toBigInt(),
  //     reader.readFieldArray(2),
  //   );
  // }

  static getFields(fields: FieldsOf<BlobPublicInputs>) {
    return [fields.z, fields.y, fields.kzgCommitment] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlobPublicInputs.getFields(this));
  }

  static fromBlob(input: Blob): BlobPublicInputs {
    return new BlobPublicInputs(input.challengeZ, toBigIntBE(input.evaluationY), input.commitmentToFields());
  }

  equals(other: BlobPublicInputs) {
    return (
      this.z.equals(other.z) &&
      this.y == other.y &&
      this.kzgCommitment[0].equals(other.kzgCommitment[0]) &&
      this.kzgCommitment[1].equals(other.kzgCommitment[1])
    );
  }

  // toFields() {
  //   const fields = serializeToFields(...BlobPublicInputs.getFields(this));
  //   if (fields.length !== BLOB_PUBLIC_INPUTS) {
  //     throw new Error(
  //       `Invalid number of fields for BlobPublicInputs. Expected ${BLOB_PUBLIC_INPUTS}, got ${fields.length}`,
  //     );
  //   }
  //   return fields;
  // }
}
