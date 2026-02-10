use crate::{config::{pack_limbs, unpack_limbs}, utils::compress_to_blob_commitment};
use super::{
    batching_blob_commitment::BatchingBlobCommitment, BLSPoint,
    final_blob_accumulator::FinalBlobAccumulator,
};
use bigcurve::{BigCurve, curves::bls12_381::{BLS12_381, BLS12_381Scalar}};
use bignum::{BigNum, BLS12_381_Fq, BLS12_381_Fr};
use std::ops::{Add, Mul};
use types::{
    constants::BLOB_ACCUMULATOR_LENGTH,
    hash::{poseidon2_hash, sha256_to_field},
    traits::{Deserialize, Empty, Serialize},
    utils::{reader::Reader, writer::Writer},
};

/**
* The outputs we care about from using the barycentric to evaluate blob i at z:
* - z_i = Challenge for one blob (=H(H(blob_i), C_i))
* - y_i = Evaluation for one blob (=p_i(z))
* - c_i = Commitment for one blob (=C_i)
*/
pub struct BlobAccumulationInputs {
    pub z_i: Field,
    pub y_i: BLS12_381_Fr,
    pub c_i: BatchingBlobCommitment,
}

/**
* Contains all fields required to construct a batched KZG proof of ALL blobs in the epoch.
* Instead of calling the point evaluation precompile on L1 for each blob, we create a multi-opening proof
* with the scheme below, and call it just once:
*   point_evaluation_precompile(b, z, y, C, BLS12_381_Fq)
* Where b (= kzg_to_versioned_hash(C)) and BLS12_381_Fq (= KZG proof) are computed outside the circuit. The other params are
* calculated here across the rollup circuits (until root, when .finalize() is called).
* Other notes:
*  - We use blob_commitments_hash to validate the commitments injected here correspond to blobs published on L1.
*  - We use gamma as the challenge for multi opening, so it can be discarded once the rollup is complete.
*  - We already know that the elements in each blob correspond to validated data from the kernels from the use of
*    the blob_sponge and validating blob_sponge.squeeze() vs H(input_elements).
*  - We encompass all the blob elements in challenges (z_i) unique to each blob by using the above H(input_elements)
*    and the blob's commitment (c_i).
*
* TODO(#14646): Compress BLS12_381_Fr and BLS12_381_Fq values to reduce number of public inputs (BLOB_ACCUMULATOR_LENGTH)
* TODO: Derive Eq, Serialize, Deserialize for BlobAccumulator instead of having manual implementations.
* Not done here as BLS12_381_Fr doesn't implement serde and orphan rule prevents me from implementing it here.
*/
pub struct BlobAccumulator {
    // Hash of Cs (to link to L1 blob hashes) (BN254Fr).
    pub blob_commitments_hash_acc: Field,
    // Challenge at which the batched blob polynomial is evaluated (BN254Fr)
    pub z_acc: Field,
    // Current state of y's linear combination (sum_i {gamma^i * y_i}) where y_i is blob_i's evaluation y.
    pub y_acc: BLS12_381_Fr,
    // Current state of C's linear combination (sum_i {gamma^i * C_i}) where C_i is blob_i's commitment C (BLS12 point: { x: BLS12Fq, y: BLS12Fq })
    pub c_acc: BLSPoint,
    // Challenge for linear combination of each blob's y and C (BLS12Fr but represented here as BN254Fr, since it is hashed natively)
    pub gamma_acc: Field,
    // gamma^i for current blob, used above.
    pub gamma_pow_acc: BLS12_381_Fr,
}

impl BlobAccumulator {
    /**
    * Init the first accumulation state of the epoch.
    *
    * First state of the accumulator:
    * - blob_commitments_hash_acc := sha256(C_0)
    * - z_acc := z_0
    * - y_acc := gamma^0 * y_0 = y_0
    * - c_acc := gamma^0 * c_0 = c_0
    * - gamma_acc := poseidon2(y_0.limbs)
    * - gamma^(i + 1) = gamma^1 = gamma // denoted gamma_pow_acc
    *
    * For all blobs i > 0 accumulated, see the below documentation for accumulate().
    *
    */
    pub fn init(first_output: BlobAccumulationInputs, final_gamma: BLS12_381_Fr) -> Self {
        // Note: we use a hash output in BN254Fr here. Although this is not uniform in the BLS12 field, this challenge is used as a part of a schwartz-zippel argument, and the only caveat is that the error in the polynomial identity is O(1/|BN254Fr|) instead of O(1/|BLS12_381_Fr|).
        let hashed_y_0 = poseidon2_hash(first_output.y_i.get_limbs().map(|l| l as Field));
        Self {
            blob_commitments_hash_acc: sha256_to_field(first_output.c_i.compressed),
            z_acc: first_output.z_i,
            y_acc: first_output.y_i,
            c_acc: first_output.c_i.point,
            gamma_acc: hashed_y_0,
            gamma_pow_acc: final_gamma,
        }
    }

    /**
    * LHS Accumulator: Current state of param accumulation from blob 0 to i-1
    * RHS Accumulator: Outputs from evaluation of blob i
    *
    * NB: blob_commitments_hash is written as v below
    *
    * Each accumulation:
    * - blob_commitments_hash_acc := sha256(blob_commitments_hash_acc, C_i)
    * - z_acc := poseidon2(z_acc, z_i)
    * - y_acc := y_acc + (gamma^i * y_i)
    * - c_acc := c_acc + (gamma^i * c_i)
    * - gamma_acc := poseidon2(gamma_acc, poseidon2(y_i.limbs))
    * - gamma^(i + 1) = gamma^i * gamma // denoted gamma_pow_acc
    *
    * Final accumulated values (from last blob of last checkpoint of epoch):
    * - blob_commitments_hash := blob_commitments_hash_acc (hash of all commitments (C_i s) to be checked on L1)
    * - z := z_acc (final challenge, at which all blobs are evaluated)
    * - y := y_acc (final opening to be checked on L1)
    * - c := c_acc (final commitment to be checked on L1)
    * - gamma := poseidon2(gamma_acc, z) (challenge for linear combination of y and C, above)
    *
    * Final values z and gamma are injected into each checkpoint root circuit. We ensure they are correct by:
    * - Checking equality in each checkpoint merge circuit and propagating up
    * - Checking final z_acc == z in root circuit
    * - Checking final gamma_acc == gamma in root circuit
    *
    */
    pub fn accumulate(self, other: BlobAccumulationInputs, final_gamma: BLS12_381_Fr) -> Self {
        let hashed_y_i = poseidon2_hash(other.y_i.get_limbs().map(|l| l as Field));

        // Equivalent to self.c_acc.add(other.c_i.point.mul(BLS12_381Scalar::from_bignum(self.gamma_pow_acc)))
        let c_acc = BLS12_381::evaluate_linear_expression(
            [other.c_i.point],
            [BLS12_381Scalar::from_bignum(self.gamma_pow_acc)],
            [self.c_acc],
        );

        Self {
            blob_commitments_hash_acc: sha256_to_field(self
                .blob_commitments_hash_acc
                .to_be_bytes::<32>()
                .concat(other.c_i.compressed)),
            z_acc: poseidon2_hash([self.z_acc, other.z_i]),
            y_acc: self.y_acc.add(other.y_i.mul(self.gamma_pow_acc)),
            c_acc,
            gamma_acc: poseidon2_hash([self.gamma_acc, hashed_y_i]),
            gamma_pow_acc: self.gamma_pow_acc.mul(final_gamma),
        }
    }

    /// Completes the final accumulator state.
    pub fn finalize(self) -> FinalBlobAccumulator {
        // Compress to 2 fields to reduce number of public inputs to the root rollup:
        let c = compress_to_blob_commitment(self.c_acc).to_compressed_fields();
        FinalBlobAccumulator {
            blob_commitments_hash: self.blob_commitments_hash_acc,
            z: self.z_acc,
            y: self.y_acc,
            c,
        }
    }
}

impl Empty for BlobAccumulator {
    fn empty() -> Self {
        Self {
            blob_commitments_hash_acc: 0,
            z_acc: 0,
            y_acc: BLS12_381_Fr::zero(),
            c_acc: BLSPoint::point_at_infinity(),
            gamma_acc: 0,
            gamma_pow_acc: BLS12_381_Fr::zero(),
        }
    }
}

impl Eq for BlobAccumulator {
    fn eq(self, other: Self) -> bool {
        (self.blob_commitments_hash_acc.eq(other.blob_commitments_hash_acc))
            & (self.z_acc.eq(other.z_acc))
            & (self.y_acc.eq(other.y_acc))
            & (self.c_acc.eq(other.c_acc))
            & (self.gamma_acc.eq(other.gamma_acc))
            & (self.gamma_pow_acc.eq(other.gamma_pow_acc))
    }
}

// TODO: Derive Eq, Serialize, Deserialize for BlobAccumulator instead of having manual implementations.
// Not done here as BLS12_381_Fr doesn't implement serde and orphan rule prevents me from implementing it here.
//
// Note: BLS12 limbs (120 bits each) are packed 2-per-field to reduce public input count.
// BLS12_381_Fr (3 limbs) -> 2 fields: [limbs[0] + 2^120 * limbs[1], limbs[2]]
// BLS12_381_Fq (4 limbs) -> 2 fields: [limbs[0] + 2^120 * limbs[1], limbs[2] + 2^120 * limbs[3]]
impl Serialize for BlobAccumulator {
    let N: u32 = BLOB_ACCUMULATOR_LENGTH;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.blob_commitments_hash_acc);
        writer.write(self.z_acc);
        // y_acc: BLS12_381_Fr (3 limbs -> 2 fields)
        let y_limbs = self.y_acc.get_limbs();
        writer.write(pack_limbs(y_limbs[0], y_limbs[1]));
        writer.write(y_limbs[2] as Field);
        // c_acc.x: BLS12_381_Fq (4 limbs -> 2 fields)
        let cx_limbs = self.c_acc.x.get_limbs();
        writer.write(pack_limbs(cx_limbs[0], cx_limbs[1]));
        writer.write(pack_limbs(cx_limbs[2], cx_limbs[3]));
        // c_acc.y: BLS12_381_Fq (4 limbs -> 2 fields)
        let cy_limbs = self.c_acc.y.get_limbs();
        writer.write(pack_limbs(cy_limbs[0], cy_limbs[1]));
        writer.write(pack_limbs(cy_limbs[2], cy_limbs[3]));
        // c_acc.is_infinity
        writer.write(self.c_acc.is_infinity as Field);
        writer.write(self.gamma_acc);
        // gamma_pow_acc: BLS12_381_Fr (3 limbs -> 2 fields)
        let gp_limbs = self.gamma_pow_acc.get_limbs();
        writer.write(pack_limbs(gp_limbs[0], gp_limbs[1]));
        writer.write(gp_limbs[2] as Field);
    }
}

impl Deserialize for BlobAccumulator {
    let N: u32 = BLOB_ACCUMULATOR_LENGTH;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let blob_commitments_hash_acc = reader.read();
        let z_acc = reader.read();
        // y_acc: BLS12_381_Fr (2 packed fields -> 3 limbs)
        let (y0, y1) = unpack_limbs(reader.read());
        let y2 = reader.read() as u128;
        // c_acc.x: BLS12_381_Fq (2 packed fields -> 4 limbs)
        let (cx0, cx1) = unpack_limbs(reader.read());
        let (cx2, cx3) = unpack_limbs(reader.read());
        // c_acc.y: BLS12_381_Fq (2 packed fields -> 4 limbs)
        let (cy0, cy1) = unpack_limbs(reader.read());
        let (cy2, cy3) = unpack_limbs(reader.read());
        let is_infinity = reader.read_bool();
        let gamma_acc = reader.read();
        // gamma_pow_acc: BLS12_381_Fr (2 packed fields -> 3 limbs)
        let (gp0, gp1) = unpack_limbs(reader.read());
        let gp2 = reader.read() as u128;
        let y_acc = BLS12_381_Fr::from_limbs([y0, y1, y2]);
        y_acc.validate_in_field();
        let c_x = BLS12_381_Fq::from_limbs([cx0, cx1, cx2, cx3]);
        c_x.validate_in_field();
        let c_y = BLS12_381_Fq::from_limbs([cy0, cy1, cy2, cy3]);
        c_y.validate_in_field();
        let gamma_pow_acc = BLS12_381_Fr::from_limbs([gp0, gp1, gp2]);
        gamma_pow_acc.validate_in_field();
        Self {
            blob_commitments_hash_acc,
            z_acc,
            y_acc,
            c_acc: BLSPoint { x: c_x, y: c_y, is_infinity },
            gamma_acc,
            gamma_pow_acc,
        }
    }
}

#[test]
fn serde_test() {
    // Use values that exercise the 120-bit limb packing
    let blob_accumulator = BlobAccumulator {
        blob_commitments_hash_acc: 1,
        z_acc: 2,
        y_acc: BLS12_381_Fr::from_limbs([
            0xabcdef1234567890abcdef12345678,
            0x12345678abcdef1234567890abcdef,
            0x5678,
        ]),
        c_acc: BLSPoint {
            x: BLS12_381_Fq::from_limbs([
                0xfedcba9876543210fedcba98765432,
                0x0a0b0c0d0e0f1234567890abcdef12,
                0x1234567890abcdef1234567890abcd,
                0x0abcde,
            ]),
            y: BLS12_381_Fq::from_limbs([
                0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5,
                0x112233445566778899aabbccddeeff,
                0xffeeddccbbaa998877665544332211,
                0x123456,
            ]),
            is_infinity: false,
        },
        gamma_acc: 42,
        gamma_pow_acc: BLS12_381_Fr::from_limbs([
            0x999888777666555444333222111000,
            0xaaabbbcccdddeeefff111222333444,
            0x5000,
        ]),
    };

    let serialized = blob_accumulator.serialize();
    let deserialized = BlobAccumulator::deserialize(serialized);
    assert_eq(blob_accumulator, deserialized);
}
