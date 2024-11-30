use crate::blob_public_inputs::{BlobCommitment, BlockBlobPublicInputs};
use types::{
    abis::sponge_blob::SpongeBlob,
    constants::{BLOB_PUBLIC_INPUTS, BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
};
// TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
// The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
// If/when simulation times of unconstrained are improved, remove this.
pub unconstrained fn evaluate_blobs(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    kzg_commitments: [BlobCommitment; BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
) -> BlockBlobPublicInputs {
    let fields = evaluate_blobs_oracle(blobs_as_fields, kzg_commitments, sponge_blob);
    BlockBlobPublicInputs::deserialize(fields)
}

#[oracle(evaluateBlobs)]
unconstrained fn evaluate_blobs_oracle(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    kzg_commitments: [BlobCommitment; BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
) -> [Field; BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK] {}
