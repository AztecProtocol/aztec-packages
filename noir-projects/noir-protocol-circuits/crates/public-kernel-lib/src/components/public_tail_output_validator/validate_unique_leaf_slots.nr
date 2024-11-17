use dep::types::{data::OverridablePublicDataTreeLeaf, utils::arrays::SortedResult};

// Validate that every non-zero slot in leaves is unique.
pub fn validate_unique_leaf_slots<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    unique_slot_index_hints: SortedResult<Field, N>,
) {
    let sorted_leaf_slots = unique_slot_index_hints.sorted_array;
    let sorted_leaf_slot_indexes = unique_slot_index_hints.sorted_index_hints;
    let original_leaf_indexes = unique_slot_index_hints.original_index_hints;
    let mut prev_slot = 0;
    for i in 0..N {
        let leaf = leaves[i].leaf;
        let sorted_index = if leaf.slot != 0 {
            sorted_leaf_slot_indexes[i]
        } else {
            i // This ensures that sorted_leaf_slots is padded with the same amount of zero slots as leaves.
        };
        let hinted_leaf_slot = sorted_leaf_slots[sorted_index];
        assert_eq(hinted_leaf_slot, leaf.slot, "mismatch hinted slot");
        assert_eq(original_leaf_indexes[sorted_index], i, "sorted value does not link to leaf"); // This ensures that each sorted_leaf_slot can only be refered to once.
        let curr_leaf_alot = sorted_leaf_slots[i];
        if leaf.slot != 0 {
            assert(prev_slot.lt(curr_leaf_alot), "hinted slots are not sorted"); // This ensures that all non-zero slots are unique.
        }
        prev_slot = curr_leaf_alot;
    }
}

mod tests {
    use crate::components::public_tail_output_validator::validate_unique_leaf_slots::validate_unique_leaf_slots;
    use dep::types::{
        data::{OverridablePublicDataTreeLeaf, PublicDataTreeLeaf},
        tests::utils::pad_end,
        utils::arrays::SortedResult,
    };

    global NUM_TEST_LEAVES = 10;

    struct TestBuilder {
        leaves: [OverridablePublicDataTreeLeaf; NUM_TEST_LEAVES],
        sorted_array: [Field; NUM_TEST_LEAVES],
        sorted_index_hints: [u32; NUM_TEST_LEAVES],
        original_index_hints: [u32; NUM_TEST_LEAVES],
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let leaves = pad_end([], OverridablePublicDataTreeLeaf::empty());
            let sorted_array = pad_end([], 0);
            let sorted_index_hints = pad_end([], 0);
            let mut original_index_hints = pad_end([], 0);
            for i in 0..original_index_hints.len() {
                original_index_hints[i] = i;
            }
            TestBuilder { leaves, sorted_array, sorted_index_hints, original_index_hints }
        }

        pub fn update_leaves<let N: u32>(&mut self, slots: [Field; N]) {
            let leaves = slots.map(|slot: Field| {
                OverridablePublicDataTreeLeaf {
                    leaf: PublicDataTreeLeaf { slot, value: 1 },
                    override_counter: 0,
                }
            });
            self.leaves = pad_end(leaves, OverridablePublicDataTreeLeaf::empty());
        }

        pub fn update_sorted_array<let N: u32>(&mut self, sorted_values: [Field; N]) {
            self.sorted_array = pad_end(sorted_values, 0);
        }

        pub fn update_sorted_index_hints<let N: u32>(&mut self, sorted_indexes: [u32; N]) {
            self.sorted_index_hints = pad_end(sorted_indexes, 0);
        }

        pub fn update_original_index_hints<let N: u32>(&mut self, original_indexes: [u32; N]) {
            let mut original_index_hints = pad_end(original_indexes, 0);
            for i in original_indexes.len()..original_index_hints.len() {
                original_index_hints[i] = i;
            }
            self.original_index_hints = original_index_hints;
        }

        pub fn execute(self) {
            let hints = SortedResult {
                sorted_array: self.sorted_array,
                sorted_index_hints: self.sorted_index_hints,
                original_index_hints: self.original_index_hints,
            };
            validate_unique_leaf_slots(self.leaves, hints);
        }
    }

    #[test]
    fn validate_unique_leaf_slots_empty_succeeds() {
        let builder = TestBuilder::new();
        builder.execute()
    }

    #[test]
    fn validate_unique_leaf_slots_succeeds() {
        let mut builder = TestBuilder::new();

        builder.update_leaves([22, 44, 33, 11]);
        builder.update_sorted_array([11, 22, 33, 44]);
        builder.update_sorted_index_hints([1, 3, 2, 0]);
        builder.update_original_index_hints([3, 0, 2, 1]);

        builder.execute()
    }

    #[test(should_fail_with = "sorted value does not link to leaf")]
    fn validate_unique_leaf_slots_duplicates_remove_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.update_leaves([22, 11, 11]);
        builder.update_sorted_array([11, 22]);
        builder.update_sorted_index_hints([1, 0, 0]);
        builder.update_original_index_hints([1, 0]);

        builder.execute()
    }

    #[test(should_fail_with = "hinted slots are not sorted")]
    fn validate_unique_leaf_slots_duplicates_extra_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.update_leaves([22, 11, 11]);
        builder.update_sorted_array([11, 11, 22]);
        builder.update_sorted_index_hints([2, 0, 1]);
        builder.update_original_index_hints([1, 2, 0]);

        builder.execute()
    }

    #[test(should_fail_with = "hinted slots are not sorted")]
    fn validate_unique_leaf_slots_duplicates_extra_hint_in_padded_first_zero_fails() {
        let mut builder = TestBuilder::new();

        builder.update_leaves([22, 11, 11]);
        builder.update_sorted_array([0, 11, 22, 0, 11]); // The first zero slot triggers the assert.
        builder.update_sorted_index_hints([2, 1, 4]);
        builder.update_original_index_hints([3, 1, 0, 4, 2]);

        builder.execute()
    }

    #[test(should_fail_with = "mismatch hinted slot")]
    fn validate_unique_leaf_slots_duplicates_extra_hint_in_padded_first_non_zero_fails() {
        let mut builder = TestBuilder::new();

        builder.update_leaves([22, 11, 11]);
        builder.update_sorted_array([1, 11, 22, 0, 11]); // Change the first slot to be non-zero.
        builder.update_sorted_index_hints([2, 1, 4]);
        builder.update_original_index_hints([3, 1, 0, 3, 2]);

        builder.execute()
    }
}
