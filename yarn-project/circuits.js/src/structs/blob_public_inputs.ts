import { toBigIntBE, toHex } from '@aztec/foundation/bigint-buffer';
import { type Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
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

  equals(other: BlobPublicInputs) {
    return (
      this.z.equals(other.z) &&
      this.y == other.y &&
      this.kzgCommitment[0].equals(other.kzgCommitment[0]) &&
      this.kzgCommitment[1].equals(other.kzgCommitment[1])
    );
  }
}
