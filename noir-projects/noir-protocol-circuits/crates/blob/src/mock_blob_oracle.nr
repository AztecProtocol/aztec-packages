use crate::abis::{BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges};
use bignum::BLS12_381_Fr;
use types::{
    constants::{BLOB_ACCUMULATOR_LENGTH, FIELDS_PER_BLOB},
    traits::{Deserialize, Serialize},
};

// TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
// The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
// If/when simulation times of unconstrained are improved, remove this.
//
// Note: `fracs` and `factor` are computed once in the checkpoint root rollup from the shared
// challenge `z` and are passed through for consistency, but are not used by the oracle.
pub unconstrained fn evaluate_blobs_and_batch<let NumBlobs: u32>(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    num_blob_fields: u32,
    expected_blob_fields_hash: Field,
    kzg_commitments: [BLSPoint; NumBlobs],
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulator,
    _fracs: [BLS12_381_Fr; FIELDS_PER_BLOB],
    _factor: BLS12_381_Fr,
) -> BlobAccumulator {
    let fields = evaluate_blobs_oracle(
        NumBlobs,
        blobs_as_fields,
        num_blob_fields,
        expected_blob_fields_hash,
        kzg_commitments,
        final_blob_challenges,
        start_accumulator.serialize(), // Serialize makes reading info easier in foreign_call_handler
    );
    BlobAccumulator::deserialize(fields)
}

#[oracle(evaluateBlobs)]
unconstrained fn evaluate_blobs_oracle<let NumBlobs: u32>(
    num_blobs: u32,
    blobs_as_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    num_blob_fields: u32,
    expected_blob_fields_hash: Field,
    kzg_commitments: [BLSPoint; NumBlobs],
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: [Field; BLOB_ACCUMULATOR_LENGTH],
) -> [Field; BLOB_ACCUMULATOR_LENGTH] {}
