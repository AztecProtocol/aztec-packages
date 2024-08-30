use dep::types::{
    abis::public_data_write::OverridablePublicDataWrite, data::public_data_hint::PublicDataHint,
    traits::Empty, utils::arrays::find_index_hint
};

struct LinkedIndexHint {
    is_first_write: bool,
    prev_index: u32,
    next_index: u32,
}

impl Empty for LinkedIndexHint {
    fn empty() -> Self {
        LinkedIndexHint { is_first_write: false, prev_index: 0, next_index: 0 }
    }
}

unconstrained fn generate_linked_index_hints<let NUM_WRITES: u32, let NUM_DATA: u32>(
    overridable_public_data_writes: [OverridablePublicDataWrite; NUM_WRITES],
    public_leaf_data: [PublicDataHint; NUM_DATA]
) -> [LinkedIndexHint; NUM_WRITES] {
    let mut hints = [LinkedIndexHint::empty(); NUM_WRITES];

    for i in 0..overridable_public_data_writes.len() {
        let write = overridable_public_data_writes[i];
        if write.counter() != 0 {
            let mut is_first_write = false;
            let mut prev_index = 0;
            let mut prev_counter = 0;
            let mut next_index = 0;
            for j in 0..overridable_public_data_writes.len() {
                let other = overridable_public_data_writes[j].write;
                if (j != i) & (other.leaf_slot == write.inner().leaf_slot) {
                    if other.counter == write.override_counter {
                        next_index = j;
                    } else if ((other.counter < write.counter())
                        & ((prev_counter == 0) | (other.counter > prev_counter))) {
                        prev_counter = other.counter;
                        prev_index = j;
                    }
                }
            }
            if prev_counter == 0 {
                is_first_write = true;
                prev_index = find_index_hint(public_leaf_data, |leaf: PublicDataHint| leaf.leaf_slot == write.inner().leaf_slot);
            }
            hints[i] = LinkedIndexHint { is_first_write, prev_index, next_index };
        }
    }

    hints
}

fn validate_linked_public_data_writes_with_hints<let NUM_WRITES: u32, let NUM_DATA: u32>(
    overridable_public_data_writes: [OverridablePublicDataWrite; NUM_WRITES],
    public_leaf_data: [PublicDataHint; NUM_DATA],
    hints: [LinkedIndexHint; NUM_WRITES]
) {
    for i in 0..overridable_public_data_writes.len() {
        let write = overridable_public_data_writes[i];
        let hint = hints[i];
        if write.counter() != 0 {
            if hint.is_first_write {
                // It's linked to a leaf in the tree.
                let data_hint = public_leaf_data[hint.prev_index];
                assert_eq(data_hint.leaf_slot, write.inner().leaf_slot, "hinted data has different leaf_slot");
                assert_eq(
                    data_hint.override_counter, write.counter(), "hinted data does not link to current write"
                );
            } else {
                // It's linked to another write for the same leaf slot.
                let prev = overridable_public_data_writes[hint.prev_index];
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
            let next = overridable_public_data_writes[hint.next_index];
            let next_hint = hints[hint.next_index];
            assert_eq(
                write.override_counter, next.counter(), "hinted next write does not link to current write"
            );
            assert_eq(next_hint.prev_index, i, "next write has different counter");
            // leaf_slot will be checked when processing the next write.
        }
    }
}

pub fn validate_linked_public_data_writes<let NUM_WRITES: u32, let NUM_DATA: u32>(
    overridable_public_data_writes: [OverridablePublicDataWrite; NUM_WRITES],
    public_leaf_data: [PublicDataHint; NUM_DATA]
) {
    let hints = generate_linked_index_hints(overridable_public_data_writes, public_leaf_data);
    validate_linked_public_data_writes_with_hints(overridable_public_data_writes, public_leaf_data, hints);
}
