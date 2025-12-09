import { BLS12_FQ_LIMBS, BLS12_FR_LIMBS } from '@aztec/constants';
import { BLS12Fq, BLS12Fr, BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * See `noir-projects/noir-protocol-circuits/crates/blob/src/abis/blob_accumulator.nr` for documentation.
 */
export class BlobAccumulator {
  constructor(
    public blobCommitmentsHashAcc: Fr,
    public zAcc: Fr,
    public yAcc: BLS12Fr,
    public cAcc: BLS12Point,
    public gammaAcc: Fr,
    public gammaPowAcc: BLS12Fr,
  ) {}

  static empty(): BlobAccumulator {
    return new BlobAccumulator(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO, Fr.ZERO, BLS12Fr.ZERO);
  }

  equals(other: BlobAccumulator) {
    return (
      this.blobCommitmentsHashAcc.equals(other.blobCommitmentsHashAcc) &&
      this.zAcc.equals(other.zAcc) &&
      this.yAcc.equals(other.yAcc) &&
      this.cAcc.equals(other.cAcc) &&
      this.gammaAcc.equals(other.gammaAcc) &&
      this.gammaPowAcc.equals(other.gammaPowAcc)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlobAccumulator {
    const reader = BufferReader.asReader(buffer);
    return new BlobAccumulator(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
      BLS12Point.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.blobCommitmentsHashAcc,
      this.zAcc,
      this.yAcc,
      this.cAcc,
      this.gammaAcc,
      this.gammaPowAcc,
    );
  }

  toFields() {
    return [
      this.blobCommitmentsHashAcc,
      this.zAcc,
      ...this.yAcc.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.cAcc.x.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.cAcc.y.toNoirBigNum().limbs.map(Fr.fromString),
      new Fr(this.cAcc.isInfinite),
      this.gammaAcc,
      ...this.gammaPowAcc.toNoirBigNum().limbs.map(Fr.fromString),
    ];
  }

  static fromFields(fields: Fr[] | FieldReader): BlobAccumulator {
    const reader = FieldReader.asReader(fields);
    return new BlobAccumulator(
      reader.readField(),
      reader.readField(),
      BLS12Fr.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FR_LIMBS).map(f => f.toString()) }),
      new BLS12Point(
        BLS12Fq.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FQ_LIMBS).map(f => f.toString()) }),
        BLS12Fq.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FQ_LIMBS).map(f => f.toString()) }),
        reader.readBoolean(),
      ),
      reader.readField(),
      BLS12Fr.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FR_LIMBS).map(f => f.toString()) }),
    );
  }

  static random() {
    return new BlobAccumulator(
      Fr.random(),
      Fr.random(),
      BLS12Fr.random(),
      BLS12Point.random(),
      Fr.random(),
      BLS12Fr.random(),
    );
  }
}
