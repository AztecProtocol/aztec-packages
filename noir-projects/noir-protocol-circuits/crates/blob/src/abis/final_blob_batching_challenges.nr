use bignum::{BigNum, BLS12_381_Fr};
use types::{
    constants::BLS12_FR_LIMBS,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

/**
* Final values z and gamma are injected into each block root circuit. We ensure they are correct by:
* - Checking equality in each block merge circuit and propagating up
* - Checking final z_acc == z in root circuit
* - Checking final gamma_acc == gamma in root circuit
*
*  - z = H(...H(H(z_0, z_1) z_2)..z_n)
*    - where z_i = H(H(fields of blob_i), C_i),
*    - used such that p_i(z) = y_i = Blob.evaluationY for all n blob polynomials p_i().
*  - gamma = H(H(...H(H(y_0, y_1) y_2)..y_n), z)
*    - used such that y = sum_i { gamma^i * y_i }, and C = sum_i { gamma^i * C_i }
*      for all blob evaluations y_i (see above) and commitments C_i.
*
* Iteratively calculated by BlobAccumulator.accumulate() above. See also precomputeBatchedBlobChallenges() in ts.
*/
pub struct FinalBlobBatchingChallenges {
    pub z: Field,
    pub gamma: BLS12_381_Fr,
}

impl Empty for FinalBlobBatchingChallenges {
    fn empty() -> Self {
        Self { z: 0, gamma: BLS12_381_Fr::zero() }
    }
}

impl Eq for FinalBlobBatchingChallenges {
    fn eq(self, other: Self) -> bool {
        (self.z.eq(other.z)) & (self.gamma.eq(other.gamma))
    }
}

impl Serialize for FinalBlobBatchingChallenges {
    let N: u32 = BLS12_FR_LIMBS + 1;

    fn serialize(self) -> [Field; Self::N] {
        let mut fields: BoundedVec<Field, BLS12_FR_LIMBS + 1> = BoundedVec::new();
        fields.push(self.z);
        fields.extend_from_array(self.gamma.get_limbs().map(|l| l as Field));
        fields.storage()
    }
}

impl Deserialize for FinalBlobBatchingChallenges {
    let N: u32 = BLS12_FR_LIMBS + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let mut item = Self {
            z: reader.read(),
            gamma: BLS12_381_Fr::from_limbs(reader.read_array().map(|e| e as u128)),
        };
        item
    }
}
