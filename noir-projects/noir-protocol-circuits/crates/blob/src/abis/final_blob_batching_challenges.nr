use bignum::{BigNum, BLS12_381_Fr};
use types::{
    base_utils::{reader::Reader, writer::Writer},
    constants::BLS12_FR_LIMBS,
    traits::{Deserialize, Empty, Serialize},
};

/**
* Final values z and gamma are injected into each block root circuit. We ensure they are correct by:
* - Checking equality in each block merge circuit and propagating up
* - Checking final z_acc == z in root circuit
* - Checking final h(gamma_acc, z) == gamma in root circuit
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

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.z);
        writer.write_array(self.gamma.get_limbs().map(|l| l as Field));
    }
}

impl Deserialize for FinalBlobBatchingChallenges {
    let N: u32 = BLS12_FR_LIMBS + 1;

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let mut item = Self {
            z: reader.read(),
            gamma: BLS12_381_Fr::from_limbs(reader.read_array().map(|e| e as u128)),
        };
        item
    }
}
