use crate::blob_batching_public_inputs::{
    BlobAccumulatorPublicInputs, BLSPoint, FinalBlobBatchingChallenges,
};
use bigint::{BigNum, bignum::BigNumTrait, BLS12_381_Fq as Q};
use types::{
    abis::sponge_blob::SpongeBlob,
    constants::{BLOB_ACCUMULATOR_PUBLIC_INPUTS, BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
    traits::Deserialize,
};

// TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
// The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
// If/when simulation times of unconstrained are improved, remove this.
pub unconstrained fn evaluate_blobs_and_batch(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    kzg_commitments: [BLSPoint; BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulatorPublicInputs,
) -> BlobAccumulatorPublicInputs {
    // TODO(MW) serialize here? is not BLOB_ACCUMULATOR_PUBLIC_INPUTS due to is_inf flag
    let fields = evaluate_blobs_oracle(
        blobs_as_fields,
        kzg_commitments.map(|p| [p.x, p.y]),
        sponge_blob,
        final_blob_challenges,
        start_accumulator,
    );
    BlobAccumulatorPublicInputs::deserialize(fields)
}

#[oracle(evaluateBlobs)]
unconstrained fn evaluate_blobs_oracle(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    kzg_commitments: [[Q; 2]; BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulatorPublicInputs,
) -> [Field; BLOB_ACCUMULATOR_PUBLIC_INPUTS] {}
