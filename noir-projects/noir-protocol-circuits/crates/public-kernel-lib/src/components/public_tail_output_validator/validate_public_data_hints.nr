use dep::types::{
    abis::public_data_read::PublicDataRead, data::public_data_hint::PublicDataHint,
    utils::arrays::get_sorted_tuple::get_sorted_tuple
};

fn sort_by_leaf_slot(a: PublicDataHint, b: PublicDataHint) -> bool {
    (b.leaf_slot == 0) | ((a.leaf_slot != 0) & a.leaf_slot.lt(b.leaf_slot))
}

unconstrained fn generate_unique_leaf_slot_hints<let N: u32>(public_data_hints: [PublicDataHint; N]) -> ([Field; N], [u32; N]) {
    let mut sorted_leaf_slots = [0; N];
    let mut sorted_leaf_slot_indexes = [N - 1; N];

    let sorted_tuples = get_sorted_tuple(public_data_hints, sort_by_leaf_slot);
    for i in 0..N {
        let elem = sorted_tuples[i].elem;
        sorted_leaf_slots[i] = elem.leaf_slot;

        let original_index = sorted_tuples[i].original_index;
        sorted_leaf_slot_indexes[original_index] = i;
    }

    (sorted_leaf_slots, sorted_leaf_slot_indexes)
}

// All non-zero leaf slots in public_data_hints must be unique, ensuring that writes with the same leaf slot are grouped into a single group.
fn validate_unique_leaf_slots<let N: u32>(
    public_data_hints: [PublicDataHint; N],
    sorted_leaf_slots: [Field; N],
    sorted_leaf_slot_indexes: [u32; N]
) {
    let mut prev_slot = 0;
    let mut num_non_zeros = 0;
    for i in 0..N {
        let data = public_data_hints[i];
        let sorted_index = if data.leaf_slot != 0 {
            sorted_leaf_slot_indexes[i]
        } else {
            num_non_zeros += 1;
            N - num_non_zeros
        };
        let hinted_leaf_slot = sorted_leaf_slots[sorted_index];
        assert_eq(hinted_leaf_slot, data.leaf_slot);

        let curr_leaf_alot = sorted_leaf_slots[i];
        if data.leaf_slot != 0 {
            assert(prev_slot.lt(curr_leaf_alot));
        } else {
            assert_eq(curr_leaf_alot, 0);
        }
        prev_slot = curr_leaf_alot;
    }
}

pub fn validate_public_data_hints<let N: u32, let M: u32>(public_data_hints: [PublicDataHint; N], tree_root: Field) {
    let (sorted_leaf_slots, sorted_leaf_slot_indexes) = generate_unique_leaf_slot_hints(public_data_hints);
    validate_unique_leaf_slots(public_data_hints, sorted_leaf_slots, sorted_leaf_slot_indexes);

    // validate membership
    for i in 0..public_data_hints.len() {
        public_data_hints[i].validate(tree_root);
    }
}
