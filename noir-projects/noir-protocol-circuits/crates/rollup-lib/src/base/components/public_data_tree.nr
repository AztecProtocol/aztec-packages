use dep::types::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, public_data_write::PublicDataWrite},
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    merkle_tree::{indexed_tree, MembershipWitness},
    traits::is_empty,
    utils::field::full_field_less_than,
};

pub(crate) fn public_data_tree_insert(
    write: PublicDataWrite,
    start_snapshot: AppendOnlyTreeSnapshot,
    low_leaf_preimage: PublicDataTreeLeafPreimage,
    low_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    sibling_path: [Field; PUBLIC_DATA_TREE_HEIGHT],
) -> AppendOnlyTreeSnapshot {
    if !is_empty(write) {
        indexed_tree::insert::<_, _, PUBLIC_DATA_TREE_HEIGHT>(
            start_snapshot,
            PublicDataTreeLeaf { slot: write.leaf_slot, value: write.value },
            low_leaf_preimage,
            low_leaf_membership_witness,
            sibling_path,
            |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf| {
                // Is valid low preimage
                let is_update = low_preimage.slot == write.slot;
                let is_low_empty = low_preimage.is_empty();

                let is_less_than_slot = full_field_less_than(low_preimage.slot, write.slot);
                let is_next_greater_than = full_field_less_than(write.slot, low_preimage.next_slot);
                let is_in_range = is_less_than_slot
                    & (
                        is_next_greater_than
                            | ((low_preimage.next_index == 0) & (low_preimage.next_slot == 0))
                    );

                (!is_low_empty) & (is_update | is_in_range)
            },
            |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf, write_index: u32| {
                // Update low leaf
                let is_update = low_preimage.slot == write.slot;
                if is_update {
                    PublicDataTreeLeafPreimage {
                        slot: low_preimage.slot,
                        value: write.value,
                        next_slot: low_preimage.next_slot,
                        next_index: low_preimage.next_index,
                    }
                } else {
                    PublicDataTreeLeafPreimage {
                        slot: low_preimage.slot,
                        value: low_preimage.value,
                        next_slot: write.slot,
                        next_index: write_index,
                    }
                }
            },
            |write: PublicDataTreeLeaf, low_preimage: PublicDataTreeLeafPreimage| {
                // Build insertion leaf
                PublicDataTreeLeafPreimage {
                    slot: write.slot,
                    value: write.value,
                    next_slot: low_preimage.next_slot,
                    next_index: low_preimage.next_index,
                }
            },
        )
    } else {
        start_snapshot
    }
}
