use crate::config::{pack_limbs, unpack_limbs};
use bignum::{BigNum, BLS12_381_Fr};
use types::{
    constants::BLS12_FR_SERIALIZED_FIELDS,
    traits::{Deserialize, Empty, Serialize},
    utils::{reader::Reader, writer::Writer},
};

/**
* Final values z and gamma are injected into each checkpoint root circuit. We ensure they are correct by:
* - Checking equality in each checkpoint merge circuit and propagating up
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
    let N: u32 = BLS12_FR_SERIALIZED_FIELDS + 1;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.z);
        let limbs = self.gamma.get_limbs();
        writer.write(pack_limbs(limbs[0], limbs[1]));
        writer.write(limbs[2] as Field);
    }
}

impl Deserialize for FinalBlobBatchingChallenges {
    let N: u32 = BLS12_FR_SERIALIZED_FIELDS + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let z = reader.read();
        let (g0, g1) = unpack_limbs(reader.read());
        let g2 = reader.read() as u128;
        let gamma = BLS12_381_Fr::from_limbs([g0, g1, g2]);
        gamma.validate_in_field();
        Self { z, gamma }
    }
}

#[test]
fn serde_test() {
    let final_blob_batching_challenges =
        FinalBlobBatchingChallenges { z: 1, gamma: BLS12_381_Fr::from_limbs([2, 3, 4]) };
    let serialized = final_blob_batching_challenges.serialize();
    let deserialized = FinalBlobBatchingChallenges::deserialize(serialized);
    assert_eq(final_blob_batching_challenges, deserialized);
}
