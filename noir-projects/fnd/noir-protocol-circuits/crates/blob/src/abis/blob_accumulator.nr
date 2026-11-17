use crate::utils::compress_to_blob_commitment;
use super::{
    batching_blob_commitment::BatchingBlobCommitment, BLSPoint,
    final_blob_accumulator::FinalBlobAccumulator,
};
use bigcurve::{BigCurve, curves::bls12_381::{BLS12_381, BLS12_381Scalar}};
use bignum::{BigNum, BLS12_381_Fq, BLS12_381_Fr};
use std::ops::{Add, Mul, Neg};
use types::{
    constants::{
        BLOB_ACCUMULATOR_LENGTH, DOM_SEP__BLOB_ALPHA_ACC, DOM_SEP__BLOB_GAMMA_ACC,
        DOM_SEP__BLOB_GAMMA_FINAL, DOM_SEP__BLOB_HASHED_Y_LIMBS,
    },
    hash::{poseidon2_hash_with_separator, sha256_to_field},
    traits::{Deserialize, Empty, Serialize},
    utils::{reader::Reader, writer::Writer},
};

/**
* Accumulates a batched KZG multi-point opening of ALL blobs in the epoch, one checkpoint at a time, so that L1 checks
* every blob with a single call to the point evaluation precompile:
*   point_evaluation_precompile(v, 0, 0, D, E)
* which checks e(D, [1]) == e(E, [s]), where v = kzg_to_versioned_hash(D).
*
* Each checkpoint k is opened at its own challenge z_k (see `evaluate_blobs_and_batch`), so a checkpoint root proof
* depends only on its own blobs and on the accumulator of the checkpoints before it. It remains valid for every epoch
* proof that ends at or after checkpoint k.
*
* For checkpoint k with blob commitments C_(k,l), evaluations y_(k,l) = p_(k,l)(z_k), and the hinted KZG proof Q_k of
* the combined polynomial p_k = sum_l gamma_k^l * p_(k,l) at z_k (which equals sum_l gamma_k^l * proof_(k,l)):
* - gamma_k := poseidon2(...poseidon2(poseidon2(y_(k,0)), poseidon2(y_(k,1)))..., z_k)
* - y_k := sum_l gamma_k^l * y_(k,l)
* - alpha_k := poseidon2(alpha_acc_(k-1), gamma_k, Q_k)
* - D_k := D_(k-1) + alpha_k * (sum_l gamma_k^l * C_(k,l) - y_k * G + z_k * Q_k)
* - E_k := E_(k-1) + alpha_k * Q_k
*
* The pairing check then asserts sum_k alpha_k * (C_k - [y_k] - (s - z_k) * Q_k) == 0.
* alpha_k must bind every opening claim up to and including checkpoint k (through alpha_acc_(k-1) and gamma_k, which
* binds z_k, so every C_(k,l), and every y_(k,l)). A per-checkpoint alpha that does not chain the previous ones lets a
* prover pick wrong y values in different checkpoints whose errors cancel in the sum.
*
* Other notes:
*  - We use blob_commitments_hash to validate the commitments injected here correspond to blobs published on L1.
*  - We already know that the elements in each blob correspond to validated data from the kernels from the use of
*    the blob_sponge and validating blob_sponge.squeeze() vs H(input_elements).
*
* TODO(#14646): Compress BLS12_381_Fr and BLS12_381_Fq values to reduce number of public inputs (BLOB_ACCUMULATOR_LENGTH)
*/
pub struct BlobAccumulator {
    // Hash of Cs (to link to L1 blob hashes) (BN254Fr).
    pub blob_commitments_hash_acc: Field,
    // Fiat-Shamir state chaining every checkpoint's opening claim (BN254Fr). Also the latest alpha_k.
    pub alpha_acc: Field,
    // sum_k alpha_k * (C_k - y_k * G + z_k * Q_k)
    pub d_acc: BLSPoint,
    // sum_k alpha_k * Q_k
    pub e_acc: BLSPoint,
}

impl BlobAccumulator {
    /**
    * Accumulates one checkpoint's blobs, of which the first `num_blobs` are used.
    *
    * blob_commitments_hash_acc := sha256(blob_commitments_hash_acc, s_i, C_i) for each used blob, where s_i is one
    * byte: 0x01 if blob i is the first of its checkpoint, 0x00 otherwise. L1 derives the same byte from the blobs
    * attached to each checkpoint proposal, so the final hash binds how the epoch's blobs are split into checkpoints,
    * not just their order. Without it, a proposal could claim a neighbouring checkpoint's blob and still match the
    * proof. The epoch's first blob starts the hash as sha256(0x01, C_0).
    */
    pub fn accumulate_checkpoint<let NumBlobs: u32>(
        self,
        commitments: [BatchingBlobCommitment; NumBlobs],
        ys: [BLS12_381_Fr; NumBlobs],
        num_blobs: u32,
        z: Field,
        kzg_proof: BatchingBlobCommitment,
    ) -> Self {
        let mut blob_commitments_hash_acc = self.blob_commitments_hash_acc;
        let mut gamma_acc = 0;
        for i in 0..NumBlobs {
            if i < num_blobs {
                blob_commitments_hash_acc = if (i == 0) & self.is_empty() {
                    sha256_to_field([1].concat(commitments[i].compressed))
                } else {
                    sha256_to_field(blob_commitments_hash_acc
                        .to_be_bytes::<32>()
                        .concat([(i == 0) as u8])
                        .concat(commitments[i].compressed))
                };

                // TODO(#13608): use a BLS12 based hash? Is using BN based safe - since the output is smaller is there a skew?
                let hashed_y_i = poseidon2_hash_with_separator(
                    ys[i].get_limbs().map(|l| l as Field),
                    DOM_SEP__BLOB_HASHED_Y_LIMBS,
                );
                gamma_acc = if i == 0 {
                    hashed_y_i
                } else {
                    poseidon2_hash_with_separator([gamma_acc, hashed_y_i], DOM_SEP__BLOB_GAMMA_ACC)
                };
            }
        }
        let gamma_field = poseidon2_hash_with_separator([gamma_acc, z], DOM_SEP__BLOB_GAMMA_FINAL);

        let kzg_proof_fields = kzg_proof.to_compressed_fields();
        let alpha_acc = poseidon2_hash_with_separator(
            [self.alpha_acc, gamma_field, kzg_proof_fields[0], kzg_proof_fields[1]],
            DOM_SEP__BLOB_ALPHA_ACC,
        );
        // Lossless: BN254 Fr is smaller than BLS12-381 Fr.
        let gamma = BLS12_381_Fr::from(gamma_field);
        let alpha = BLS12_381_Fr::from(alpha_acc);

        // D_k - D_(k-1) = sum_l (alpha * gamma^l) * C_l + (-alpha * y) * G + (alpha * z) * Q, as a single MSM.
        let mut points: [BLSPoint; NumBlobs + 2] = [BLSPoint::point_at_infinity(); NumBlobs + 2];
        let mut scalars: [BLS12_381Scalar; NumBlobs + 2] =
            [BLS12_381Scalar::from_bignum(BLS12_381_Fr::zero()); NumBlobs + 2];
        let mut y = BLS12_381_Fr::zero();
        let mut alpha_gamma_pow = alpha;
        let mut gamma_pow = BLS12_381_Fr::one();
        for i in 0..NumBlobs {
            if i < num_blobs {
                points[i] = commitments[i].point;
                scalars[i] = BLS12_381Scalar::from_bignum(alpha_gamma_pow);
                y = y.add(ys[i].mul(gamma_pow));
                alpha_gamma_pow = alpha_gamma_pow.mul(gamma);
                gamma_pow = gamma_pow.mul(gamma);
            }
        }
        points[NumBlobs] = BLS12_381::one();
        scalars[NumBlobs] = BLS12_381Scalar::from_bignum(alpha.mul(y).neg());
        points[NumBlobs + 1] = kzg_proof.point;
        scalars[NumBlobs + 1] = BLS12_381Scalar::from_bignum(alpha.mul(BLS12_381_Fr::from(z)));

        let d_acc = BLS12_381::evaluate_linear_expression(points, scalars, [self.d_acc]);
        let e_acc = BLS12_381::evaluate_linear_expression(
            [kzg_proof.point],
            [BLS12_381Scalar::from_bignum(alpha)],
            [self.e_acc],
        );

        Self { blob_commitments_hash_acc, alpha_acc, d_acc, e_acc }
    }

    /// Completes the final accumulator state.
    pub fn finalize(self) -> FinalBlobAccumulator {
        // Compress to 2 fields each to reduce number of public inputs to the root rollup:
        FinalBlobAccumulator {
            blob_commitments_hash: self.blob_commitments_hash_acc,
            d: compress_to_blob_commitment(self.d_acc).to_compressed_fields(),
            e: compress_to_blob_commitment(self.e_acc).to_compressed_fields(),
        }
    }
}

impl Empty for BlobAccumulator {
    fn empty() -> Self {
        Self {
            blob_commitments_hash_acc: 0,
            alpha_acc: 0,
            d_acc: BLSPoint::point_at_infinity(),
            e_acc: BLSPoint::point_at_infinity(),
        }
    }
}

impl Eq for BlobAccumulator {
    fn eq(self, other: Self) -> bool {
        (self.blob_commitments_hash_acc.eq(other.blob_commitments_hash_acc))
            & (self.alpha_acc.eq(other.alpha_acc))
            & (self.d_acc.eq(other.d_acc))
            & (self.e_acc.eq(other.e_acc))
    }
}

// TODO: Derive Eq, Serialize, Deserialize for BlobAccumulator. Not done here as BLS12_381_Fq doesn't implement serde
// and the orphan rule prevents implementing it here.
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
        writer.write(self.alpha_acc);
        write_point(writer, self.d_acc);
        write_point(writer, self.e_acc);
    }
}

#[inline_always]
fn write_point<let K: u32>(writer: &mut Writer<K>, point: BLSPoint) {
    writer.write_array(point.x.get_limbs().map(|l| l as Field));
    writer.write_array(point.y.get_limbs().map(|l| l as Field));
    writer.write(point.is_infinity as Field);
}

#[inline_always]
fn read_point<let K: u32>(reader: &mut Reader<K>) -> BLSPoint {
    BLSPoint {
        x: BLS12_381_Fq::from_limbs(reader.read_array().map(|e| e as u128)),
        y: BLS12_381_Fq::from_limbs(reader.read_array().map(|e| e as u128)),
        is_infinity: reader.read_bool(),
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
        Self {
            blob_commitments_hash_acc: reader.read(),
            alpha_acc: reader.read(),
            d_acc: read_point(reader),
            e_acc: read_point(reader),
        }
    }
}

#[test]
fn serde_test() {
    let blob_accumulator = BlobAccumulator {
        blob_commitments_hash_acc: 1,
        alpha_acc: 2,
        d_acc: BLSPoint {
            x: BLS12_381_Fq::from_limbs([6, 7, 8, 0]),
            y: BLS12_381_Fq::from_limbs([10, 11, 12, 13]),
            is_infinity: false,
        },
        e_acc: BLSPoint {
            x: BLS12_381_Fq::from_limbs([14, 15, 16, 17]),
            y: BLS12_381_Fq::from_limbs([18, 19, 20, 21]),
            is_infinity: false,
        },
    };

    let serialized = blob_accumulator.serialize();
    let deserialized = BlobAccumulator::deserialize(serialized);
    assert_eq(blob_accumulator, deserialized);
}
