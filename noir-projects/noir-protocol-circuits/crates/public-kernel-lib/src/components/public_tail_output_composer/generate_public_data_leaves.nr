use dep::types::{
    abis::{public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest},
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint, PublicDataTreeLeaf},
    utils::arrays::get_sorted_tuple
};

struct SlotIndex {
    slot: Field,
    index: u32,
    counter: u32,
}

fn compare_by_slot_then_index(a: SlotIndex, b: SlotIndex) -> bool {
    if a.slot == b.slot {
        (a.index == 0) | (b.index > a.index)
    } else {
        (b.slot == 0) | ((a.slot != 0) & a.slot.lt(b.slot))
    }
}

fn compare_by_index(a: SlotIndex, b: SlotIndex) -> bool {
    (b.slot == 0) | ((a.slot != 0) & (a.index < b.index))
}

unconstrained pub fn generate_public_data_leaves<let NUM_READS: u32, let NUM_WRITES: u32, let NUM_HINTS: u32>(
    reads: [PublicDataRead; NUM_READS],
    writes: [PublicDataUpdateRequest; NUM_WRITES],
    hints: [PublicDataLeafHint; NUM_HINTS]
) -> [OverridablePublicDataTreeLeaf; NUM_HINTS] {
    let mut slot_indexes: BoundedVec<SlotIndex, NUM_HINTS> = BoundedVec::new();
    for i in 0..reads.len() {
        let read = reads[i];
        if read.leaf_slot != 0 {
            slot_indexes.push(SlotIndex { slot: read.leaf_slot, index: i, counter: 0 });
        }
    }
    for i in 0..writes.len() {
        let write = writes[i];
        if write.leaf_slot != 0 {
            slot_indexes.push(SlotIndex { slot: write.leaf_slot, index: i + NUM_READS, counter: write.counter });
        }
    }
    let sorted_slot_indexes = slot_indexes.storage.sort_via(compare_by_slot_then_index);

    let mut prev_slot = 0;
    let mut override_counter = 0;
    let mut unique_slot_indexes: BoundedVec<SlotIndex, NUM_HINTS> = BoundedVec::new();
    for sorted in sorted_slot_indexes {
        if sorted.slot != 0 {
            if sorted.slot != prev_slot {
                unique_slot_indexes.push(sorted);
                prev_slot = sorted.slot;
                override_counter = 0;
            }
            if (sorted.index >= NUM_READS)
                & ((override_counter == 0) | (sorted.counter < override_counter)) {
                override_counter = sorted.counter;
                unique_slot_indexes.storage[unique_slot_indexes.len() - 1].counter = override_counter;
            }
        }
    }

    let sorted_unique_slot_indexes = unique_slot_indexes.storage.sort_via(compare_by_index);
    let mut leaves = [OverridablePublicDataTreeLeaf::empty(); NUM_HINTS];
    for i in 0..unique_slot_indexes.len() {
        let sorted = sorted_unique_slot_indexes[i];
        let hint = hints[i];
        let exists = hint.preimage.slot == sorted.slot;
        let value = if exists { hint.preimage.value } else { 0 };
        leaves[i] = OverridablePublicDataTreeLeaf { leaf: PublicDataTreeLeaf { slot: sorted.slot, value  }, override_counter: sorted.counter };
    }

    leaves
}
