use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, sponge_blob::SpongeBlob,
        state_reference::StateReference,
    },
    constants::BLOCK_ROLLUP_PUBLIC_INPUTS_LENGTH,
    tests::utils::make_fixture,
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

    // Timestamp of the first block in this block range.
    // Validated against the previous checkpoint's end timestamp in the checkpoint root.
    pub start_timestamp: u64,
    // Timestamp of the last block in this block range.
    // Validated on L1 to ensure it matches the slot's timestamp.
    pub end_timestamp: u64,

    // Root of the `l1_to_l2` message subtree, set in the first block root and propagated to the checkpoint root.
    // Block root rollups that are not the first in a checkpoint will have an `in_hash` value of 0.
    pub in_hash: Field,

    // Hash of the `l2_to_l1` message subtree. It will be combined with the `out_hash` from other blocks in the
    // same checkpoint to form a wonky tree. The root of that tree becomes the final `out_hash` used on L1.
    // TODO(#15793): Keep accumulating `out_hash` all the way up to the root rollup, and set the final hash on L1 when
    // proving an epoch.
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
