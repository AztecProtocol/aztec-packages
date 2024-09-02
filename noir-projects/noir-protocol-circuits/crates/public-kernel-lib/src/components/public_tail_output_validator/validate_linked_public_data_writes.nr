use crate::components::public_tail_output_composer::LinkedIndexHint;
use dep::types::{abis::public_data_write::OverridablePublicDataWrite, data::OverridablePublicDataTreeLeaf};

fn validate_linked_public_data_writes<let NUM_WRITES: u32, let NUM_LEAVES: u32>(
    public_data_writes: [OverridablePublicDataWrite; NUM_WRITES],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
    hints: [LinkedIndexHint; NUM_WRITES]
) {
    for i in 0..public_data_writes.len() {
        let write = public_data_writes[i];
        let hint = hints[i];
        if write.counter() != 0 {
            if hint.is_first_write {
                // It's linked to a leaf in the tree.
                let data_hint = public_data_leaves[hint.prev_index];
                assert_eq(data_hint.leaf.slot, write.inner().leaf_slot, "hinted data has different leaf_slot");
                assert_eq(
                    data_hint.override_counter, write.counter(), "hinted data does not link to current write"
                );
            } else {
                // It's linked to another write for the same leaf slot.
                let prev = public_data_writes[hint.prev_index];
                assert_eq(
                    prev.inner().leaf_slot, write.inner().leaf_slot, "hinted write has different leaf_slot"
                );
                assert(prev.counter() < write.counter(), "previous write must have a smaller counter");
                assert_eq(
                    prev.override_counter, write.counter(), "hinted previous write does not link to current write"
                );
            }
        }

        if write.override_counter != 0 {
            let next = public_data_writes[hint.next_index];
            let next_hint = hints[hint.next_index];
            assert_eq(
                write.override_counter, next.counter(), "hinted next write does not link to current write"
            );
            assert_eq(next_hint.prev_index, i, "next write has different counter");
            // leaf_slot will be checked when processing the next write.
        }
    }
}
