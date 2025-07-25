// This will be moved to a separate Read Request Reset Circuit.
use crate::reset::read_request::{
    PendingReadHint, ReadRequestAction, ReadValueHint, SettledReadHint,
};
use dep::types::{
    abis::note_hash_leaf_preimage::NoteHashLeafPreimage,
    constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_TX, NOTE_HASH_TREE_HEIGHT},
    merkle_tree::MembershipWitness,
    traits::Empty,
};

pub struct NoteHashSettledReadHint {
    pub read_request_index: u32,
    pub membership_witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT>,
    pub leaf_preimage: NoteHashLeafPreimage,
}

impl ReadValueHint for NoteHashSettledReadHint {
    fn read_request_index(self) -> u32 {
        self.read_request_index
    }
}

impl SettledReadHint<NOTE_HASH_TREE_HEIGHT, NoteHashLeafPreimage> for NoteHashSettledReadHint {
    fn membership_witness(self) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT> {
        self.membership_witness
    }

    fn leaf_preimage(self) -> NoteHashLeafPreimage {
        self.leaf_preimage
    }

    fn skip(read_request_len: u32) -> Self {
        NoteHashSettledReadHint {
            read_request_index: read_request_len,
            membership_witness: MembershipWitness::empty(),
            leaf_preimage: NoteHashLeafPreimage::empty(),
        }
    }
}

pub struct NoteHashReadRequestHints<let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> {
    pub read_request_actions: [ReadRequestAction; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    pub pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
    pub settled_read_hints: [NoteHashSettledReadHint; SETTLED_READ_HINTS_LEN],
}

mod tests {
    use crate::note_hash_read_request_reset::NoteHashSettledReadHint;
    use crate::reset::read_request::{
        get_propagated_read_requests, PendingReadHint, ReadRequestAction, ReadRequestActions,
        verify_reset_read_requests,
    };
    use dep::types::{
        abis::{
            note_hash::{NoteHash, ScopedNoteHash},
            note_hash_leaf_preimage::NoteHashLeafPreimage,
            read_request::{ReadRequest, ScopedReadRequest},
        },
        address::AztecAddress,
        constants::NOTE_HASH_TREE_HEIGHT,
        hash::compute_siloed_note_hash,
        merkle_tree::{leaf_preimage::LeafPreimage, MembershipWitness},
        tests::{merkle_tree_utils::NonEmptyMerkleTree, utils::assert_array_eq},
        traits::{Empty, FromField},
    };
    use types::utils::arrays::ClaimedLengthArray;

    struct TestBuilder<let READ_REQUEST_LEN: u32, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> {
        contract_address: AztecAddress,
        read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
        read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
        pending_values: ClaimedLengthArray<ScopedNoteHash, PENDING_VALUE_LEN>,
        pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
        pending_read_amount: u32,
        leaf_preimages: [NoteHashLeafPreimage; SETTLED_READ_HINTS_LEN],
        settled_read_amount: u32,
    }

    impl TestBuilder<5, 4, 3, 2> {
        pub fn new() -> Self {
            let contract_address = AztecAddress::from_field(123);

            // Create 4 note hashes. 10 and 11 are settled. 12 and 13 are pending.
            let note_hashes = [10, 11, 12, 13];
            let siloed_note_hashes =
                note_hashes.map(|n| compute_siloed_note_hash(contract_address, n));
            // We don't need to hash it with a real nonce
            let unique_note_hashes = siloed_note_hashes.map(|note_hash| note_hash + 1000);
            // Create 5 read requests. 0 and 3 are reading settled note hashes. 1, 2 and 4 are reading pending note hashes.
            let read_requests = ClaimedLengthArray {
                array: [
                    ReadRequest { value: unique_note_hashes[1], counter: 11 }.scope(
                        contract_address,
                    ), // settled
                    ReadRequest { value: note_hashes[3], counter: 13 }.scope(contract_address), // pending
                    ReadRequest { value: note_hashes[2], counter: 39 }.scope(contract_address), // pending
                    ReadRequest { value: unique_note_hashes[0], counter: 46 }.scope(
                        contract_address,
                    ), // settled
                    ReadRequest { value: note_hashes[3], counter: 78 }.scope(contract_address), // pending
                ],
                length: 5,
            };

            let read_request_actions = [
                ReadRequestAction { action: ReadRequestActions.READ_AS_SETTLED, hint_index: 0 },
                ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index: 0 },
                ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index: 1 },
                ReadRequestAction { action: ReadRequestActions.READ_AS_SETTLED, hint_index: 1 },
                ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index: 2 },
            ];

            let pending_values = ClaimedLengthArray {
                array: [
                    NoteHash { value: note_hashes[2], counter: 2 }.scope(contract_address),
                    NoteHash { value: note_hashes[3], counter: 8 }.scope(contract_address),
                    ScopedNoteHash::empty(),
                    ScopedNoteHash::empty(),
                ],
                length: 4,
            };

            let pending_read_hints = [
                PendingReadHint { read_request_index: 1, pending_value_index: 1 },
                PendingReadHint { read_request_index: 2, pending_value_index: 0 },
                PendingReadHint { read_request_index: 4, pending_value_index: 1 },
            ];

            let leaf_preimages = [
                NoteHashLeafPreimage { value: unique_note_hashes[0] },
                NoteHashLeafPreimage { value: unique_note_hashes[1] },
            ];

            TestBuilder {
                contract_address,
                read_requests,
                read_request_actions,
                pending_values,
                pending_read_hints,
                pending_read_amount: pending_read_hints.len(),
                leaf_preimages,
                settled_read_amount: leaf_preimages.len(),
            }
        }
    }

    impl<let READ_REQUEST_LEN: u32, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> TestBuilder<READ_REQUEST_LEN, PENDING_VALUE_LEN, PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN> {
        fn build_tree(
            self,
        ) -> NonEmptyMerkleTree<2, NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT - 1, 1> {
            NonEmptyMerkleTree::new(
                [self.leaf_preimages[0].as_leaf(), self.leaf_preimages[1].as_leaf()],
                [0; NOTE_HASH_TREE_HEIGHT],
                [0; NOTE_HASH_TREE_HEIGHT - 1],
                [0; 1],
            )
        }

        pub fn get_settled_read_hints(self) -> ([NoteHashSettledReadHint; 2], Field) {
            let tree = self.build_tree();
            let hints = [
                NoteHashSettledReadHint {
                    read_request_index: 0,
                    membership_witness: MembershipWitness {
                        leaf_index: 1,
                        sibling_path: tree.get_sibling_path(1),
                    },
                    leaf_preimage: self.leaf_preimages[1],
                },
                NoteHashSettledReadHint {
                    read_request_index: 3,
                    membership_witness: MembershipWitness {
                        leaf_index: 0,
                        sibling_path: tree.get_sibling_path(0),
                    },
                    leaf_preimage: self.leaf_preimages[0],
                },
            ];
            let tree_root = tree.get_root();
            (hints, tree_root)
        }

        pub unconstrained fn get_propagated_read_requests(
            self,
        ) -> ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN> {
            get_propagated_read_requests(self.read_requests, self.read_request_actions)
        }

        pub fn verify(self) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            // Safety: this is only used in tests.
            let unverified_read_requests = unsafe { self.get_propagated_read_requests() };
            verify_reset_read_requests(
                self.read_requests,
                self.pending_values,
                self.read_request_actions,
                self.pending_read_hints,
                self.pending_read_amount,
                settled_hints,
                self.settled_read_amount,
                tree_root,
                unverified_read_requests,
            );
        }
    }

    #[test]
    fn verify_reset_note_hash_read_requests_clears_all_succeeds() {
        let builder = TestBuilder::new();
        // Safety: this is a test.
        let unverified_read_requests = unsafe { builder.get_propagated_read_requests() };
        assert(unverified_read_requests.is_empty());

        builder.verify();
    }

    #[test]
    fn verify_reset_note_hash_read_requests_clears_partial_succeeds() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[2] = ReadRequestAction::empty();
        builder.read_request_actions[4] = ReadRequestAction::empty();

        let read_requests = builder.read_requests;
        // Safety: this is a test.
        let unverified_read_requests = unsafe { builder.get_propagated_read_requests() };
        assert_array_eq(
            unverified_read_requests.array,
            [read_requests.array[2], read_requests.array[4]],
        );

        builder.verify();
    }

    #[test(should_fail_with = "Value of the note hash does not match read request")]
    fn verify_reset_note_hash_read_requests_wrong_hinted_value_fails() {
        let mut builder = TestBuilder::new();

        // Tweak the value to be something different.
        builder.pending_values.array[0].note_hash.value += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Contract address of the note hash does not match read request")]
    fn verify_reset_note_hash_read_requests_different_contract_addresses_fails() {
        let mut builder = TestBuilder::new();

        builder.pending_values.array[0].contract_address.inner += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Read request counter must be greater than the counter of the note hash")]
    fn verify_reset_note_hash_read_requests_invalid_counter_fails() {
        let mut builder = TestBuilder::new();

        let hint = builder.pending_read_hints[0];
        let pending_read = builder.read_requests.array[hint.read_request_index];
        // Tweak the counter of the value to be greater than the read request.
        builder.pending_values.array[hint.pending_value_index].note_hash.counter =
            pending_read.counter() + 1;

        builder.verify();
    }

    #[test(should_fail_with = "Value of the note hash leaf does not match read request")]
    fn verify_reset_note_hash_read_requests_invalid_leaf_fails() {
        let mut builder = TestBuilder::new();

        let (settled_read_hints, _) = builder.get_settled_read_hints();
        let hint = settled_read_hints[0];
        // Tweak the value of the first settled read to be something different.
        builder.read_requests.array[hint.read_request_index].read_request.value += 1;

        builder.verify();
    }
}
