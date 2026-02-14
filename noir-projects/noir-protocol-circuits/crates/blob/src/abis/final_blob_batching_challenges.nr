use types::{
    constants::FINAL_BLOB_BATCHING_CHALLENGES_LENGTH,
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
*    - used as a basis for nested hashing to derive multipliers gamma_pow_acc_i for
*      y = sum_i { gamma_pow_acc_i * y_i } and C = sum_i { gamma_pow_acc_i * C_i }.
*
* Iteratively calculated by BlobAccumulator.accumulate() above. See also precomputeBatchedBlobChallenges() in ts.
*/
pub struct FinalBlobBatchingChallenges {
    pub z: Field,
    pub gamma: Field,
}

impl Empty for FinalBlobBatchingChallenges {
    fn empty() -> Self {
        Self { z: 0, gamma: 0 }
    }
}

impl Eq for FinalBlobBatchingChallenges {
    fn eq(self, other: Self) -> bool {
        (self.z.eq(other.z)) & (self.gamma.eq(other.gamma))
    }
}

impl Serialize for FinalBlobBatchingChallenges {
    let N: u32 = FINAL_BLOB_BATCHING_CHALLENGES_LENGTH;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.z);
        writer.write(self.gamma);
    }
}

impl Deserialize for FinalBlobBatchingChallenges {
    let N: u32 = FINAL_BLOB_BATCHING_CHALLENGES_LENGTH;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { z: reader.read(), gamma: reader.read() }
    }
}

#[test]
fn serde_test() {
    let final_blob_batching_challenges = FinalBlobBatchingChallenges { z: 1, gamma: 2 };
    let serialized = final_blob_batching_challenges.serialize();
    let deserialized = FinalBlobBatchingChallenges::deserialize(serialized);
    assert_eq(final_blob_batching_challenges, deserialized);
}
