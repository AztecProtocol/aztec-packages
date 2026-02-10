import { BLS12Fq, BLS12Fr, BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

const TWO_POW_120 = 1n << 120n;
const MASK_120 = TWO_POW_120 - 1n;

/** Packs two 120-bit limbs into one BN254 Fr: limb0 + 2^120 * limb1. */
function packLimbs(limb0: bigint, limb1: bigint): Fr {
  return new Fr(limb0 + TWO_POW_120 * limb1);
}

/** Splits a packed BN254 Fr back into two 120-bit limb strings. */
function unpackLimbs(packed: Fr): [string, string] {
  const value = packed.toBigInt();
  return [(value & MASK_120).toString(), (value >> 120n).toString()];
}

/** Packs BLS12_381_Fr (3 limbs) into 2 fields: [pack(limbs[0], limbs[1]), limbs[2]]. */
function packFrLimbs(fr: BLS12Fr): Fr[] {
  const limbs = fr.toNoirBigNum().limbs.map(BigInt);
  return [packLimbs(limbs[0], limbs[1]), new Fr(limbs[2])];
}

/** Unpacks 2 fields into BLS12_381_Fr (3 limbs). */
function unpackFrLimbs(field0: Fr, field1: Fr): BLS12Fr {
  const [lo, hi] = unpackLimbs(field0);
  return BLS12Fr.fromNoirBigNum({ limbs: [lo, hi, field1.toBigInt().toString()] });
}

/** Packs BLS12_381_Fq (4 limbs) into 2 fields: [pack(limbs[0], limbs[1]), pack(limbs[2], limbs[3])]. */
function packFqLimbs(fq: BLS12Fq): Fr[] {
  const limbs = fq.toNoirBigNum().limbs.map(BigInt);
  return [packLimbs(limbs[0], limbs[1]), packLimbs(limbs[2], limbs[3])];
}

/** Unpacks 2 fields into BLS12_381_Fq (4 limbs). */
function unpackFqLimbs(field0: Fr, field1: Fr): BLS12Fq {
  const [lo0, hi0] = unpackLimbs(field0);
  const [lo1, hi1] = unpackLimbs(field1);
  return BLS12Fq.fromNoirBigNum({ limbs: [lo0, hi0, lo1, hi1] });
}

/**
 * See `noir-projects/noir-protocol-circuits/crates/blob/src/abis/blob_accumulator.nr` for documentation.
 *
 * toFields/fromFields use packed BLS12 limb serialization (2 x 120-bit limbs per BN254 field)
 * matching the Noir Serialize/Deserialize impls.
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
      ...packFrLimbs(this.yAcc),
      ...packFqLimbs(this.cAcc.x),
      ...packFqLimbs(this.cAcc.y),
      new Fr(this.cAcc.isInfinite),
      this.gammaAcc,
      ...packFrLimbs(this.gammaPowAcc),
    ];
  }

  static fromFields(fields: Fr[] | FieldReader): BlobAccumulator {
    const reader = FieldReader.asReader(fields);
    const blobCommitmentsHashAcc = reader.readField();
    const zAcc = reader.readField();
    // y_acc: BLS12_381_Fr (2 packed fields -> 3 limbs)
    const yAcc = unpackFrLimbs(reader.readField(), reader.readField());
    // c_acc.x: BLS12_381_Fq (2 packed fields -> 4 limbs)
    const cAccX = unpackFqLimbs(reader.readField(), reader.readField());
    // c_acc.y: BLS12_381_Fq (2 packed fields -> 4 limbs)
    const cAccY = unpackFqLimbs(reader.readField(), reader.readField());
    const isInfinite = reader.readBoolean();
    const gammaAcc = reader.readField();
    // gamma_pow_acc: BLS12_381_Fr (2 packed fields -> 3 limbs)
    const gammaPowAcc = unpackFrLimbs(reader.readField(), reader.readField());
    return new BlobAccumulator(
      blobCommitmentsHashAcc,
      zAcc,
      yAcc,
      new BLS12Point(cAccX, cAccY, isInfinite),
      gammaAcc,
      gammaPowAcc,
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
