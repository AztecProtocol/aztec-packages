use dep::types::{
    abis::{public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest},
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint, PublicDataTreeLeaf},
    traits::Empty,
    utils::arrays::{get_sorted_result, SortedResult},
};

pub struct SlotIndex {
    slot: Field,
    index: u32,
    counter: u32,
}

impl Eq for SlotIndex {
    fn eq(self, other: Self) -> bool {
        (self.slot == other.slot) & (self.index == other.index) & (self.counter == other.counter)
    }
}

impl Empty for SlotIndex {
    fn empty() -> Self {
        SlotIndex { slot: 0, index: 0, counter: 0 }
    }
}

fn compare_by_slot_then_index(a: SlotIndex, b: SlotIndex) -> bool {
    if a.slot == b.slot {
        (a.index == 0) | (b.index > a.index)
    } else {
        (b.slot == 0) | ((a.slot != 0) & a.slot.lt(b.slot))
    }
}

fn compare_by_index(a: SlotIndex, b: SlotIndex) -> bool {
    (a.slot != 0) & ((b.slot == 0) | (a.index < b.index))
}

pub unconstrained fn generate_public_data_leaves<let NUM_READS: u32, let NUM_WRITES: u32, let NUM_HINTS: u32>(
    reads: [PublicDataRead; NUM_READS],
    writes: [PublicDataUpdateRequest; NUM_WRITES],
    hints: [PublicDataLeafHint; NUM_HINTS],
) -> ([OverridablePublicDataTreeLeaf; NUM_HINTS], SortedResult<Field, NUM_HINTS>) {
    // Combine reads and writes. The combined data has the slots and original indexes.
    // Original indexes for writes are modified to have an offset of NUM_READS, ensuring that writes are placed after reads.
    let mut combined_data: BoundedVec<SlotIndex, NUM_HINTS> = BoundedVec::new();
    for i in 0..reads.len() {
        let read = reads[i];
        if read.leaf_slot != 0 {
            combined_data.push(SlotIndex { slot: read.leaf_slot, index: i, counter: 0 });
        }
    }
    for i in 0..writes.len() {
        let write = writes[i];
        if write.leaf_slot != 0 {
            combined_data.push(
                SlotIndex { slot: write.leaf_slot, index: i + NUM_READS, counter: write.counter },
            );
        }
    }

    // Sort the combined data by slot then index.
    // Find the data with unique slots from the sorted result.
    let sorted_combined_data = combined_data.storage.sort_via(compare_by_slot_then_index);
    let mut prev_slot = 0;
    let mut override_counter = 0;
    let mut data_with_unique_slot: BoundedVec<SlotIndex, NUM_HINTS> = BoundedVec::new();
    for i in 0..combined_data.len() {
        let data = sorted_combined_data[i];
        if data.slot != prev_slot {
            // Found an unique slot.
            data_with_unique_slot.push(data);
            prev_slot = data.slot;
            override_counter = 0;
        }
        if data.index >= NUM_READS {
            // Found a write.
            // If it's the first write, update the override_counter of the data with the same slot.
            if (override_counter == 0) | (data.counter < override_counter) {
                override_counter = data.counter;
                data_with_unique_slot.storage[data_with_unique_slot.len() - 1].counter =
                    override_counter;
            }
        }
    }
    let sorted_unique_slots = data_with_unique_slot.storage.map(|d: SlotIndex| d.slot);

    // Sort the data by original index.
    let mut leaves = [OverridablePublicDataTreeLeaf::empty(); NUM_HINTS];
    let sorted_result = get_sorted_result(data_with_unique_slot.storage, compare_by_index);
    for i in 0..data_with_unique_slot.len() {
        let sorted = sorted_result.sorted_array[i];
        // The provided hints should've been sorted.
        let hint = hints[i];
        let exists = hint.preimage.slot == sorted.slot;
        let value = if exists { hint.preimage.value } else { 0 };
        leaves[i] = OverridablePublicDataTreeLeaf {
            leaf: PublicDataTreeLeaf { slot: sorted.slot, value },
            override_counter: sorted.counter,
        };
    }

    (
        leaves,
        SortedResult {
            sorted_array: sorted_unique_slots,
            sorted_index_hints: sorted_result.original_index_hints, // We sort the sorted_unique_slots to get the hints so original_index_hints becomes the sorted_index_hints and vice versa.
            original_index_hints: sorted_result.sorted_index_hints,
        },
    )
}
