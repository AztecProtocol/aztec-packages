use bigcurve::{
    BigCurveTrait,
    curves::bls12_381::{BLS12_381 as BLSPoint, BLS12_381_SCALAR_SLICES, BLS12_381Scalar},
    ScalarFieldTrait,
};
use bigint::{BigNum, bignum::BigNumTrait, BLS12_381_Fq as Q, BLS12_381_Fr as F};
use std::ops::{Add, Mul};
use types::{
    hash::{poseidon2_hash, sha256_to_field},
    traits::Empty,
    utils::{arrays::array_splice, field::{byte_to_bits_be, field_from_bytes}},
};

pub struct BatchingBlobCommitment {
    pub point: BLSPoint,
    pub compressed: [u8; 48], // TODO(MW): get Q::num_bytes from somewhere, rather than hardcoded 48
}

impl BatchingBlobCommitment {
    // The compressed form is a BLS12Fq field encoded as 2 BN fields.
    // The first is the first 31 bytes, and the second is the next 17 bytes:
    pub fn to_compressed_fields(self) -> [Field; 2] {
        [
            // field 0 is bytes 0..31
            field_from_bytes::<31>(array_splice(self.compressed, 0), true),
            // field 1 is bytes 31..48
            field_from_bytes::<17>(array_splice(self.compressed, 31), true),
        ]
    }
}

impl Eq for BatchingBlobCommitment {
    fn eq(self, other: Self) -> bool {
        (self.point.eq(other.point)) & (self.compressed.eq(other.compressed))
    }
}

impl Empty for BatchingBlobCommitment {
    fn empty() -> Self {
        Self { point: BLSPoint::point_at_infinity(), compressed: [0; 48] }
    }
}

// TODO(MW): get_flags() and compress_to_bytes() will eventually be part of BigCurve.

// Ideally we would impl like:
// impl From<BLSPoint> for BlobCommitment {
//     }
// }
// impl BLSPoint {
//     fn get_flags(point: BLSPoint) -> ([bool; 3], Q) {
//     }
//     fn compress_to_bytes(self) -> [u8; 48] {
//     }
// }

// So, e.g., can just call point.compress_to_bytes() in future. For now:
pub fn compress_to_blob_commitment(point: BLSPoint) -> (BatchingBlobCommitment) {
    let (flags, x) = get_flags(point);
    // TODO(MW): use built in .to_be_bytes() in bignum 0.7.0
    let mut compressed = bignum_limbs_to_be_bytes::<_, 381>(x.limbs);
    let most_sig_bits = byte_to_bits_be(compressed[0]);
    // TODO(MW): May not need to assert this since Bignum may check it's 381 bits?
    for i in 0..3 {
        assert_eq(most_sig_bits[i], 0, "Invalid BLS12-381 x coordinate given to compress().");
    }
    // Flip some bits (NB: this is probably not efficient but just easier to log/visualise for now)
    let mut flip = 0;
    // flags = [is_compressed, is_infinity, is_greater]
    // if (is_compressed) { flip most sig bit in u8 => byte |= 2**7 => byte |= 2 << 6 }
    // if (is_infinity) { flip next most sig bit in u8 => byte |= 2**6 => byte |= 2 << 5 }
    // if (is_compressed) { flip next most sig bit in u8 => byte |= 2**5 => byte |= 2 << 4 }
    for i in 0..3 {
        if flags[i] {
            flip += 2 << (6 - i);
        }
    }
    compressed[0] |= flip;
    BatchingBlobCommitment { point, compressed }
}

fn get_flags(point: BLSPoint) -> ([bool; 3], Q) {
    let x = point.x;
    let y = point.y;
    let is_greater = y > -y;
    let is_infinity = point.is_infinity;
    let is_compressed = true;
    let flags = [is_compressed, is_infinity, is_greater];
    (flags, x)
}

// Will be included as .to_be_bytes() in bignum 0.7.0 TODO(MW): remove when bumped
fn bignum_limbs_to_be_bytes<let N: u32, let MOD_BITS: u32>(
    val: [u128; N],
) -> [u8; (MOD_BITS + 7) / 8] {
    let mut result: [u8; (MOD_BITS + 7) / 8] = [0; (MOD_BITS + 7) / 8];
    // the last limb will not have all the 15 bytes so we deal with the full limbs first
    for i in 0..N - 1 {
        let index = N - i - 2;
        let limb_bytes: [u8; 15] = (val[index] as Field).to_be_bytes();
        for j in 0..15 {
            // we leave the space for the first byte empty, which would take (MOD_BITS+7)/8 - MOD_BITS/8 bytes
            result[i * 15 + j + (MOD_BITS + 7) / 8 - (N - 1) * 15] = limb_bytes[j];
        }
    }
    // now we deal with the last limb
    let last_limb_bytes: [u8; ((MOD_BITS + 7) / 8 - (N - 1) * 15)] =
        (val[N - 1] as Field).to_be_bytes();

    for i in 0..((MOD_BITS + 7) / 8 - (N - 1) * 15) {
        result[i] = last_limb_bytes[i];
    }
    result
}

// The outputs we care about from using the barycentric to evaluate a blob at z in blob.nr
pub struct BlobAccumulationInputs {
    pub z_i: Field, // Challenge for one blob (=H(H(blob_i), C_i))
    pub y_i: F, // Evaluation for one blob (=p(z))
    pub c_i: BatchingBlobCommitment, // Commitment for one blob (=C_i)
}

impl Empty for BlobAccumulationInputs {
    fn empty() -> Self {
        Self { z_i: 0, y_i: BigNum::zero(), c_i: BatchingBlobCommitment::empty() }
    }
}

/**
* Contains all fields required to construct a batched KZG proof of ALL blobs in the epoch.
* Instead of calling the point evaluation precompile on L1 for each blob, we create a multi-opening proof
* with the scheme below, and call it just once:
*   point_evaluation_precompile(b, z, y, C, Q)
* Where b (= kzg_to_versioned_hash(C)) and Q (= KZG proof) are computed outside the circuit. The other params are
* calculated here across the rollup circuits (until root, when .finalize() is called).
* Other notes:
*  - We use v to validate the commitments injected here correspond to blobs published on L1.
*  - We use gamma as the challenge for multi opening, so it can be discarded once the rollup is complete.
*  - We already know that the elements in each blob correspond to validated data from the kernels from the use of
*    the blob_sponge and validating blob_sponge.squeeze() vs H(input_elements).
*  - We encompass all the blob elements in challenges (z_i) unique to each blob by using the above H(input_elements)
*    and the blob's commitment (c_i).
*/
pub struct BlobPublicInputsAcc {
    pub v: Field, // Hash of Cs (to link to L1 blob hashes) (BN254Fr)
    pub z: Field, // Challenge at which the batched blob polynomial is evaluated (BN254Fr)
    pub y: F, // Current state of y's linear combination (sum_i {gamma^i * y_i}) where y_i is blob_i's evaluation y (BLS12Fr)
    pub c: BLSPoint, // Current state of C's linear combination (sum_i {gamma^i * C_i}) where C_i is blob_i's commitment C (BLS12 point: { x: BLS12Fq, y: BLS12Fq })
    pub gamma: Field, // Challenge for linear combination of each blob's y and C (BLS12Fr but represented here as BN254Fr, since it is hashed natively)
    pub gamma_pow: F, // gamma^i for current blob, used above (BLS12Fr)
}

impl BlobPublicInputsAcc {
    /**
    * LHS Accumulator: Current state of param accumulation from blob 0 to i-1
    * RHS Accumulator: Outputs from evaluation of blob i
    *
    * Each accumulation:
    * - v_acc := sha256(v_acc, C_i)
    * - z_acc := poseidon2(z_acc, z_i)
    * - y_acc := y_acc + (gamma^i * y_i)
    * - c_acc := c_acc + (gamma^i * c_i)
    * - gamma_acc := poseidon2(gamma_acc, poseidon2(y_i.limbs))
    * - gamma^(i + 1) = gamma^i * final_gamma // denoted gamma_pow
    *
    * Final accumulated values (from last blob of last block of epoch):
    * - v := v_acc (hash of all commitments (C_i s) to be checked on L1)
    * - z := z_acc (final challenge, at which all blobs are evaluated)
    * - y := y_acc (final opening to be checked on L1)
    * - c := c_acc (final commitment to be checked on L1)
    * - gamma := poseidon2(gamma_acc, z) (challenge for linear combination of y and C, above)
    *
    * Final values z and gamma are injected into each block root circuit. We ensure they are correct by:
    * - Checking equality in each block merge circuit and propagating up
    * - Checking final z_acc == z in root circuit
    * - Checking final gamma_acc == gamma in root circuit
    *
    */
    pub fn accumulate(self, other: BlobAccumulationInputs, final_gamma: F) -> Self {
        // TODO(MW): use a BLS12 based hash? Is using BN based safe - since the output is smaller is there a skew?
        let hashed_y_i = poseidon2_hash(other.y_i.limbs.map(|l| l as Field));
        Self {
            v: sha256_to_field(self.v.to_be_bytes::<32>().concat(other.c_i.compressed)),
            z: poseidon2_hash([self.z, other.z_i]),
            y: self.y.add(other.y_i.mul(self.gamma_pow)),
            c: self.c.add(other.c_i.point.mul(BLS12_381Scalar::from_bignum(self.gamma_pow))),
            gamma: poseidon2_hash([self.gamma, hashed_y_i]),
            gamma_pow: self.gamma_pow.mul(final_gamma),
        }
    }

    pub fn init(first_output: BlobAccumulationInputs, final_gamma: F) -> Self {
        // TODO(MW): use a BLS12 based hash? Is using BN based safe - since the output is smaller is there a skew?
        let hashed_y_0 = poseidon2_hash(first_output.y_i.limbs.map(|l| l as Field));
        Self {
            v: sha256_to_field(first_output.c_i.compressed),
            z: first_output.z_i,
            y: first_output.y_i, // y_acc_0 = gamma^0 * y_0 = y_0
            c: first_output.c_i.point, // c_acc_0 = gamma^0 * c_0 = c_0
            gamma: hashed_y_0,
            gamma_pow: final_gamma,
        }
    }

    // TODO(MW): bother with this as a separate fn? All values are final in 'last' circuit apart from gamma.
    pub fn finalize(self) -> Self {
        Self {
            v: self.v,
            z: self.z,
            y: self.y,
            c: self.c,
            gamma: poseidon2_hash([self.gamma, self.z]),
            gamma_pow: self.gamma_pow,
        }
    }
}

impl Empty for BlobPublicInputsAcc {
    fn empty() -> Self {
        Self {
            v: 0,
            z: 0,
            y: F::zero(),
            c: BLSPoint::point_at_infinity(),
            gamma: 0,
            gamma_pow: F::zero(),
        }
    }
}

impl Eq for BlobPublicInputsAcc {
    fn eq(self, other: Self) -> bool {
        (self.v.eq(other.v))
            & (self.z.eq(other.z))
            & (self.y.eq(other.y))
            & (self.c.eq(other.c))
            & (self.gamma.eq(other.gamma))
            & (self.gamma_pow.eq(other.gamma_pow))
    }
}

mod tests {
    use crate::blob_batching_public_inputs::{compress_to_blob_commitment, get_flags};
    use bigcurve::{
        BigCurveTrait,
        CurveParamsTrait,
        curves::bls12_381::{BLS12_381 as Point, BLS12_381_Params},
    };
    use bigint::{BigNumTrait, BLS12_381_Fq as Q};
    use std::ops::{Add, Mul};
    #[test]
    unconstrained fn point_compression() {
        let point = Point::offset_generator();
        let (flags, x) = get_flags(point);
        // is_compressed = true
        assert_eq(flags[0], true);
        // is_infinity = false
        assert_eq(flags[1], false);
        // is_greater = false (point.y < -point.y for G)
        assert_eq(flags[2], false);
        // Decompress back to the same point:
        let mut bytes = compress_to_blob_commitment(point).compressed;
        // Same as &= 0b0001_1111 - clear first three bits of our flags
        bytes[0] &= 31;
        let reconstructed_x = Q::from_be_bytes(bytes);
        assert_eq(reconstructed_x, x);
        let (a, b) = (BLS12_381_Params::a(), BLS12_381_Params::b());
        // y^2 = x^3 + ax + b
        let reconstructed_y_squared =
            reconstructed_x.__pow(Q::from(3)).add(a.mul(reconstructed_x)).add(b);
        let mut reconstructed_y = reconstructed_y_squared.__tonelli_shanks_sqrt().unwrap();
        // If the sqrt returned is the 'greater' one, negate it (since here is_greater = false):
        reconstructed_y = if reconstructed_y > -reconstructed_y {
            -reconstructed_y
        } else {
            reconstructed_y
        };
        assert_eq(reconstructed_y, point.y);
    }
}
