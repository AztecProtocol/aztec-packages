use crate::utils::compress_to_blob_commitment;
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
    utils::reader::Reader,
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
    * - v_acc := sha256(C_0)
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
        // TODO(#13608): use a BLS12 based hash? Is using BN based safe - since the output is smaller is there a skew?
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
    * - v_acc := sha256(v_acc, C_i)
    * - z_acc := poseidon2(z_acc, z_i)
    * - y_acc := y_acc + (gamma^i * y_i)
    * - c_acc := c_acc + (gamma^i * c_i)
    * - gamma_acc := poseidon2(gamma_acc, poseidon2(y_i.limbs))
    * - gamma^(i + 1) = gamma^i * gamma // denoted gamma_pow_acc
    *
    * Final accumulated values (from last blob of last checkpoint of epoch):
    * - v := v_acc (hash of all commitments (C_i s) to be checked on L1)
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
        // TODO(#13608): use a BLS12 based hash? Is using BN based safe - since the output is smaller is there a skew?
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
impl Serialize for BlobAccumulator {
    let N: u32 = BLOB_ACCUMULATOR_LENGTH;

    fn serialize(self) -> [Field; BLOB_ACCUMULATOR_LENGTH] {
        let mut fields: BoundedVec<Field, BLOB_ACCUMULATOR_LENGTH> = BoundedVec::new();
        fields.push(self.blob_commitments_hash_acc);
        fields.push(self.z_acc);
        fields.extend_from_array(self.y_acc.get_limbs().map(|l| l as Field));
        fields.extend_from_array(self.c_acc.x.get_limbs().map(|l| l as Field));
        fields.extend_from_array(self.c_acc.y.get_limbs().map(|l| l as Field));
        fields.push(self.c_acc.is_infinity as Field);
        fields.push(self.gamma_acc);
        fields.extend_from_array(self.gamma_pow_acc.get_limbs().map(|l| l as Field));
        fields.storage()
    }
}

// TODO: Derive Eq, Serialize, Deserialize for BlobAccumulator. Not done here as BLS12_381_Fr doesn't implement it
// and orphan rule prevents me from implementing it here.
impl Deserialize for BlobAccumulator {
    let N: u32 = BLOB_ACCUMULATOR_LENGTH;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let mut item = Self {
            blob_commitments_hash_acc: reader.read(),
            z_acc: reader.read(),
            y_acc: BLS12_381_Fr::from_limbs(reader.read_array().map(|e| e as u128)),
            c_acc: BLSPoint {
                x: BLS12_381_Fq::from_limbs(reader.read_array().map(|e| e as u128)),
                y: BLS12_381_Fq::from_limbs(reader.read_array().map(|e| e as u128)),
                is_infinity: reader.read_bool(),
            },
            gamma_acc: reader.read(),
            gamma_pow_acc: BLS12_381_Fr::from_limbs(reader.read_array().map(|e| e as u128)),
        };
        item
    }
}
