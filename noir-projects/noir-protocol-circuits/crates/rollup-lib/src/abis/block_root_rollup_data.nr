use blob::blob_batching_public_inputs::{
    BlobAccumulatorPublicInputs, BLSPoint, FinalBlobBatchingChallenges,
};
use parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use types::{
    abis::block_header::BlockHeader,
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    },
};

pub struct BlockRootRollupData {
    // Inputs required to process l1 to l2 messages.
    pub l1_to_l2_roots: RootRollupParityInput,
    // Hint for inserting the new l1 to l2 message subtree.
    pub l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],

    // Hint for checking the hash of previous_block_header is the last leaf of the previous archive.
    pub previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Hint for inserting the new block hash to the last archive.
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Previous block header is used to verify the start state of the first tx in a block.
    // Its hash is checked against the previous archive.
    pub previous_block_header: BlockHeader,

    // <-- NOTE: start_blob_accumulator and  final_blob_challenges exist here and not BlockRootRollupBlobData
    // so we can inject easily into EmptyBlockRootRollupInputs:

    // The current blob accumulation state across the epoch.
    // Injected here and checked vs the previous end state in each block merge and root rollup circuit:
    pub start_blob_accumulator: BlobAccumulatorPublicInputs,
    // Finalized challenges z and gamma for performing blob batching. Shared value across the epoch
    // Precompjuted, injected here, and confirmed in the root rollup circuit:
    pub final_blob_challenges: FinalBlobBatchingChallenges,

    // -->

    // Identifier of the prover.
    pub prover_id: Field,
}

pub struct BlockRootRollupBlobData {
    // Fields for blob verification made of all tx effects in this block
    pub blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    // see blob/src/blob.nr -> evaluate_blob() -  these are used for creating each blob's challenge z_i
    pub blob_commitments: [BLSPoint; BLOBS_PER_BLOCK],
    // Flat sha256 hash of the EVM blob hashes, can be injected here as the contract checks its validity
    // Only exists so we have a link between EVM blob hashes and the block header for users to check
    // NB: to fit it into a field, we truncate to 31 bytes
    pub blobs_hash: Field,
}
