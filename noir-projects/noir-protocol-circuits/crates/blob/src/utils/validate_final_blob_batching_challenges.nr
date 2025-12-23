use crate::abis::{
    blob_accumulator::BlobAccumulator, final_blob_batching_challenges::FinalBlobBatchingChallenges,
};
use bignum::bignum;
use types::hash::poseidon2_hash;

/// Validate the challenges used throughout the blob accumulation against the final state of the accumulator.
pub fn validate_final_blob_batching_challenges(
    accumulator: BlobAccumulator,
    challenges: FinalBlobBatchingChallenges,
) {
    // AUDIT_COMMENT: I'm not yet convinced that the value of `z` that's been propagated through the checkpoint circuits is being asserted to equal accumulator.z_acc. Need to spend longer reading this.
    assert_eq(accumulator.z_acc, challenges.z, "Final blob challenge z mismatch.");

    let gamma = poseidon2_hash([accumulator.gamma_acc, accumulator.z_acc]);
    // AUDIT_COMMENT: come back to this to check whether this `to_field` conversion is lossy
    assert_eq(gamma, bignum::to_field(challenges.gamma), "Final blob challenge gamma mismatch.");
}
