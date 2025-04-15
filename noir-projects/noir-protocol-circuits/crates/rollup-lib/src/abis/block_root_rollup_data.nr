use blob::blob_public_inputs::BlobCommitment;
use parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use types::{
    block_header::BlockHeader,
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    },
};

pub struct BlockRootRollupData {
    // Inputs required to process l1 to l2 messages.
    pub l1_to_l2_roots: RootRollupParityInput,
    // Hint for inserting the new l1 to l2 message subtree.
    pub l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],

    // Hint for inserting the new block hash to the last archive.
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Previous block header is used to verify the start state of the first tx in a block.
    // Its hash will be included in the public inputs. It will be checked:
    // - against previous block hash on L1 for the first block in batch.
    // - against previous block_root.end_block_hash in a block_merge.
    pub previous_block_header: BlockHeader,

    // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    pub prover_id: Field,
}

pub struct BlockRootRollupBlobData {
    // Fields for blob verification made of all tx effects in this block
    // (will likely change to be accumulated and sent up to the final root)
    pub blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    // see blob/src/blob.nr -> evaluate_blob() -  these are used for creating the challenge z
    pub blob_commitments: [BlobCommitment; BLOBS_PER_BLOCK],
    // Flat sha256 hash of the EVM blob hashes, can be injected here as the contract checks its validity vs the blob_public_inputs below
    // NB: to fit it into a field, we truncate to 31 bytes
    pub blobs_hash: Field,
}
