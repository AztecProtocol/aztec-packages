use crate::abis::{
    blob_accumulator::BlobAccumulator, final_blob_batching_challenges::FinalBlobBatchingChallenges,
};
use bignum::bignum;
use types::{constants::DOM_SEP__BLOB_GAMMA_FINAL, hash::poseidon2_hash_with_separator};

/// Validate the challenges used throughout the blob accumulation against the final state of the accumulator.
pub fn validate_final_blob_batching_challenges(
    accumulator: BlobAccumulator,
    challenges: FinalBlobBatchingChallenges,
) {
    assert_eq(accumulator.z_acc, challenges.z, "Final blob challenge z mismatch.");

    let gamma = poseidon2_hash_with_separator(
        [accumulator.gamma_acc, accumulator.z_acc],
        DOM_SEP__BLOB_GAMMA_FINAL,
    );
    assert_eq(gamma, bignum::to_field(challenges.gamma), "Final blob challenge gamma mismatch.");
}
