use crate::abis::L1ToL2MessageSponge;
use protocol_test_utils::make_fixture;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::BLOCK_ROLLUP_PUBLIC_INPUTS_LENGTH,
    traits::{Deserialize, Serialize},
};

/// Public inputs for the block root and block merge rollup circuits.
#[derive(Deserialize, Eq, Serialize)]
pub struct BlockRollupPublicInputs {
    pub constants: CheckpointConstantData,

    // Archive tree root immediately before this block range.
    pub previous_archive: AppendOnlyTreeSnapshot,
    // Archive tree root after applying this block range.
    pub new_archive: AppendOnlyTreeSnapshot,

    // State reference immediately before this block range.
    pub start_state: StateReference,
    // State reference after applying this block range.
    pub end_state: StateReference,

    // Sponge blob after absorbing tx effects and block end markers of all the blocks before this block range.
    pub start_sponge_blob: SpongeBlob,
    // Sponge blob after additionally absorbing tx effects and block end markers from this block range.
    pub end_sponge_blob: SpongeBlob,

    // Timestamp of the blocks in this block range.
    // All blocks within a checkpoint must share the same timestamp. This value will be set to the checkpoint header and
    // checked on L1 to match the slot's timestamp.
    pub timestamp: u64,

    // Hash of the headers of all blocks in this block range. It will be combined with the `block_headers_hash` from
    // other blocks in the same checkpoint to form an unbalanced tree. The root of that tree becomes the final hash
    // stored in the checkpoint header, enabling validation of the blocks included in a checkpoint given their headers.
    pub block_headers_hash: Field,

    // Whether this block range starts at the first block of its checkpoint. Only the first block root variants set it
    // true; merges propagate it from the left rollup (`merge_block_rollups`), and
    // `validate_consecutive_block_rollups` asserts the right rollup of every merge is not a first block. The flag is
    // therefore a proof that the range's leftmost leaf is a first-variant block root, which is what lets the
    // checkpoint root assert its leftmost block is one (`checkpoint_root_inputs_validator`) even though it cannot see
    // the leaf VK indices. Since only first variants may be fully empty (no txs and no messages), that also confines
    // a fully-empty filler block to the first position of a checkpoint.
    pub is_first_block: bool,

    // Poseidon2 message-bundle sponge threaded across the blocks of the checkpoint. The leftmost block starts from the
    // empty sponge and each block absorbs its bundle's leaves; `validate_consecutive_block_rollups` asserts
    // `right.start_msg_sponge == left.end_msg_sponge`, and merges take `start` from the left and `end` from the right.
    // The checkpoint root asserts the merged end equals the parity root's sponge over the same (padded) leaf list.
    pub start_msg_sponge: L1ToL2MessageSponge,
    pub end_msg_sponge: L1ToL2MessageSponge,

    // Root of the *wonky* tree composed of all tx out hashes in this block. It will be combined with the `out_hash`
    // values from other blocks within the same checkpoint to form a *wonky* tree.
    // The tx and block out hashes form a wonky tree and not an unbalanced tree because zero values are skipped.
    pub out_hash: Field,

    // Accumulated fees for all blocks in this block range.
    pub accumulated_fees: Field,

    // Accumulated mana used for all blocks in this block range.
    pub accumulated_mana_used: Field,
}

impl BlockRollupPublicInputs {
    pub fn num_blocks(self) -> u16 {
        // Each block header hash is inserted into the archive tree in order, incrementing `next_available_leaf_index`
        // by 1 for each new block. So the number of blocks created between the two snapshots is the difference between
        // the indices.
        let num_blocks = self.new_archive.next_available_leaf_index
            - self.previous_archive.next_available_leaf_index;
        num_blocks.assert_max_bit_size::<16>();
        num_blocks as u16
    }
}

#[test]
fn serialization_of_block_rollup_public_inputs() {
    let item: BlockRollupPublicInputs = make_fixture(1);
    let serialized: [Field; BLOCK_ROLLUP_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = BlockRollupPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn correct_num_blocks() {
    let mut item: BlockRollupPublicInputs = make_fixture(1);
    item.previous_archive.next_available_leaf_index = 35;
    item.new_archive.next_available_leaf_index = 38;
    assert_eq(item.num_blocks(), 3);
}

#[test]
fn correct_num_blocks_with_large_leaf_indices() {
    let mut item: BlockRollupPublicInputs = make_fixture(1);
    item.previous_archive.next_available_leaf_index = ((1 << 16) + 35) as Field;
    item.new_archive.next_available_leaf_index = ((1 << 16) + 38) as Field;
    assert_eq(item.num_blocks(), 3);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn num_blocks_too_large() {
    let mut item: BlockRollupPublicInputs = make_fixture(1);
    item.previous_archive.next_available_leaf_index = 35;
    item.new_archive.next_available_leaf_index = ((1 << 16) + 35) as Field;
    let _ = item.num_blocks();
}
