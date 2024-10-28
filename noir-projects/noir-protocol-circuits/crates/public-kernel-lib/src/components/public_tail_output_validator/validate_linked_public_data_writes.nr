use crate::components::public_tail_output_composer::LinkedIndexHint;
use dep::types::{
    abis::public_data_write::OverridablePublicDataWrite, data::OverridablePublicDataTreeLeaf,
};

// Check that each non-empty write is correctly linked to either a leaf or another write.
// All the writes with the same leaf slot will form a single linked list.
// Note that public_data_leaves must be verified to contain unique slots before passing to this function.
pub fn validate_linked_public_data_writes<let NUM_WRITES: u32, let NUM_LEAVES: u32>(
    public_data_writes: [OverridablePublicDataWrite; NUM_WRITES],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
    hints: [LinkedIndexHint; NUM_WRITES],
) {
    for i in 0..public_data_writes.len() {
        let write = public_data_writes[i];
        let hint = hints[i];
        if write.counter() != 0 {
            if hint.is_first_write {
                // It's linked to a leaf in the tree.
                let data_hint = public_data_leaves[hint.prev_index];
                assert_eq(
                    data_hint.leaf.slot,
                    write.inner().leaf_slot,
                    "hinted leaf has different slot",
                );
                assert_eq(
                    data_hint.override_counter,
                    write.counter(),
                    "hinted leaf does not link to current write",
                );
            } else {
                // It's linked to another write for the same leaf slot.
                let prev = public_data_writes[hint.prev_index];
                assert_eq(
                    prev.inner().leaf_slot,
                    write.inner().leaf_slot,
                    "hinted write has different slot",
                );
                assert(
                    prev.counter() < write.counter(),
                    "previous write must have a smaller counter",
                );
                assert_eq(
                    prev.override_counter,
                    write.counter(),
                    "hinted previous write does not link to current write",
                );
            }
        }
    }
}

mod tests {
    use crate::components::{
        public_tail_output_composer::LinkedIndexHint,
        public_tail_output_validator::validate_linked_public_data_writes::validate_linked_public_data_writes,
    };
    use dep::types::{
        abis::{
            public_data_update_request::PublicDataUpdateRequest,
            public_data_write::OverridablePublicDataWrite,
        },
        data::{OverridablePublicDataTreeLeaf, PublicDataTreeLeaf},
        tests::utils::pad_end,
    };

    struct TestBuilder {
        public_data_writes: [OverridablePublicDataWrite; 8],
        public_data_leaves: [OverridablePublicDataTreeLeaf; 12],
        hints: [LinkedIndexHint; 8],
    }

    impl TestBuilder {
        pub fn new_empty() -> Self {
            let public_data_writes = pad_end([], OverridablePublicDataWrite::empty());
            let public_data_leaves = pad_end([], OverridablePublicDataTreeLeaf::empty());
            let hints = pad_end([], LinkedIndexHint::empty());
            TestBuilder { public_data_writes, public_data_leaves, hints }
        }

        pub fn new() -> Self {
            let public_data_writes = pad_end(
                [
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 33,
                            new_value: 300,
                            counter: 30,
                        },
                        override_counter: 0,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 22,
                            new_value: 202,
                            counter: 40,
                        },
                        override_counter: 50,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 11,
                            new_value: 100,
                            counter: 10,
                        },
                        override_counter: 0,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 22,
                            new_value: 201,
                            counter: 20,
                        },
                        override_counter: 40,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 22,
                            new_value: 203,
                            counter: 50,
                        },
                        override_counter: 0,
                    },
                ],
                OverridablePublicDataWrite::empty(),
            );

            let public_data_leaves = pad_end(
                [
                    OverridablePublicDataTreeLeaf {
                        leaf: PublicDataTreeLeaf { slot: 0, value: 0 },
                        override_counter: 0,
                    },
                    OverridablePublicDataTreeLeaf {
                        leaf: PublicDataTreeLeaf { slot: 22, value: 200 },
                        override_counter: 20,
                    },
                    OverridablePublicDataTreeLeaf {
                        leaf: PublicDataTreeLeaf { slot: 44, value: 0 },
                        override_counter: 0,
                    },
                    OverridablePublicDataTreeLeaf {
                        leaf: PublicDataTreeLeaf { slot: 11, value: 0 },
                        override_counter: 10,
                    },
                    OverridablePublicDataTreeLeaf {
                        leaf: PublicDataTreeLeaf { slot: 33, value: 0 },
                        override_counter: 30,
                    },
                ],
                OverridablePublicDataTreeLeaf::empty(),
            );

            let hints = pad_end(
                [
                    LinkedIndexHint { is_first_write: true, prev_index: 4 },
                    LinkedIndexHint { is_first_write: false, prev_index: 3 },
                    LinkedIndexHint { is_first_write: true, prev_index: 3 },
                    LinkedIndexHint { is_first_write: true, prev_index: 1 },
                    LinkedIndexHint { is_first_write: false, prev_index: 1 },
                ],
                LinkedIndexHint::empty(),
            );

            TestBuilder { public_data_writes, public_data_leaves, hints }
        }

        pub fn execute(self) {
            validate_linked_public_data_writes(
                self.public_data_writes,
                self.public_data_leaves,
                self.hints,
            );
        }
    }

    #[test]
    fn validate_linked_public_data_writes_empty_succeeds() {
        let builder = TestBuilder::new_empty();
        builder.execute();
    }

    #[test]
    fn validate_linked_public_data_writes_succeeds() {
        let builder = TestBuilder::new();
        builder.execute();
    }

    #[test(should_fail_with = "hinted leaf has different slot")]
    fn validate_linked_public_data_writes_link_prev_to_empty_leaf_fails() {
        let mut builder = TestBuilder::new();

        // Link the first write to an empty leaf.
        builder.hints[0].prev_index = 7;

        builder.execute();
    }

    #[test(should_fail_with = "hinted leaf does not link to current write")]
    fn validate_linked_public_data_writes_link_two_writes_to_same_leaf_fails() {
        let mut builder = TestBuilder::new();

        // Link the write to a leaf with the same slot.
        builder.hints[1] = builder.hints[3];

        builder.execute();
    }

    #[test(should_fail_with = "hinted write has different slot")]
    fn validate_linked_public_data_writes_link_prev_to_empty_write_fails() {
        let mut builder = TestBuilder::new();

        // Link the write to an empty write.
        builder.hints[1].prev_index = 7;

        builder.execute();
    }

    #[test(should_fail_with = "previous write must have a smaller counter")]
    fn validate_linked_public_data_writes_not_sorted_by_counter_fails() {
        let mut builder = TestBuilder::new();

        // Change from leaf -> write[3] -> write[1] -> write[4] to leaf -> write[1] -> write[3] -> write[4]
        let leaf_index = builder.hints[3].prev_index;
        // Link the leaf to the 1st write.
        builder.public_data_leaves[leaf_index].override_counter =
            builder.public_data_writes[1].counter();
        // Link the 1st write to the leaf and the 3rd write.
        builder.hints[1].is_first_write = true;
        builder.hints[1].prev_index = leaf_index;
        builder.public_data_writes[1].override_counter = builder.public_data_writes[3].counter();
        // Link the 3rd write to the 1st write and the 4th write.
        builder.hints[3].is_first_write = false;
        builder.hints[3].prev_index = 1;
        builder.public_data_writes[3].override_counter = builder.public_data_writes[4].counter();
        // Link the 4th write to the 3rd write.
        builder.hints[4].prev_index = 3;

        builder.execute();
    }

    #[test(should_fail_with = "hinted previous write does not link to current write")]
    fn validate_linked_public_data_writes_link_two_writes_to_same_prev_write_fails() {
        let mut builder = TestBuilder::new();

        // Link a write to the previous write of its previous write.
        let prev_write_index = builder.hints[4].prev_index;
        builder.hints[4].prev_index = 3;
        // Clear the counter and link of its previous write.
        builder.public_data_writes[prev_write_index].override_counter = 0;

        builder.execute();
    }
}
