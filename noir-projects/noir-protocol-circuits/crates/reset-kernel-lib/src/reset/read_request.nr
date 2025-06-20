use dep::types::{
    abis::{read_request::ScopedReadRequest, side_effect::Readable},
    merkle_tree::{assert_check_membership, LeafPreimage, MembershipWitness},
    traits::Empty,
    utils::arrays::AppendedUnvalidatedArray,
};

pub struct ReadRequestActionsEnum {
    pub SKIP: u8,
    pub READ_AS_PENDING: u8,
    pub READ_AS_SETTLED: u8,
}

pub global ReadRequestActions: ReadRequestActionsEnum =
    ReadRequestActionsEnum { SKIP: 0, READ_AS_PENDING: 1, READ_AS_SETTLED: 2 };

#[derive(Eq)]
pub struct ReadRequestAction {
    pub action_enum: u8,
    pub hint_index: u32,
}

impl Empty for ReadRequestAction {
    fn empty() -> Self {
        ReadRequestAction { action_enum: ReadRequestActions.SKIP, hint_index: 0 }
    }
}

impl ReadRequestAction {
    pub fn set_as_skip() -> Self {
        ReadRequestAction { action_enum: ReadRequestActions.SKIP, hint_index: 0 }
    }

    pub fn set_as_pending(hint_index: u32) -> Self {
        ReadRequestAction { action_enum: ReadRequestActions.READ_AS_PENDING, hint_index }
    }

    pub fn set_as_settled(hint_index: u32) -> Self {
        ReadRequestAction { action_enum: ReadRequestActions.READ_AS_SETTLED, hint_index }
    }
}

pub trait ReadValueHint {
    fn read_request_index(self) -> u32;
}

pub struct PendingReadHint {
    pub read_request_index: u32,
    pub pending_value_index: u32,
}

impl ReadValueHint for PendingReadHint {
    fn read_request_index(self) -> u32 {
        self.read_request_index
    }
}

impl PendingReadHint {
    pub fn skip(read_request_len: u32) -> Self {
        PendingReadHint { read_request_index: read_request_len, pending_value_index: 0 }
    }
}

pub trait SettledReadHint<let TREE_HEIGHT: u32, LEAF_PREIMAGE>
where
    LEAF_PREIMAGE: LeafPreimage,
{
    fn membership_witness(self) -> MembershipWitness<TREE_HEIGHT>;
    fn leaf_preimage(self) -> LEAF_PREIMAGE;
    fn skip(read_request_len: u32) -> Self;
}

// Validate the values being read were emitted in the same transaction before the read request were made.
// More info here:
// - https://discourse.aztec.network/t/to-read-or-not-to-read/178
// - https://discourse.aztec.network/t/spending-notes-which-havent-yet-been-inserted/180
fn validate_pending_read_requests<let READ_REQUEST_LEN: u32, T, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32>(
    read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
    pending_values: AppendedUnvalidatedArray<T, PENDING_VALUE_LEN>,
    hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
    pending_read_amount: u32,
)
where
    T: Readable<ScopedReadRequest>,
{
    for i in 0..READ_REQUEST_LEN {
        if i < pending_read_amount {
            let hint = hints[i];
            let read_request_index = hint.read_request_index;
            if read_request_index != READ_REQUEST_LEN {
                let read_request = read_requests.array[read_request_index];
                let pending_value = pending_values.array[hint.pending_value_index];
                pending_value.assert_match_read_request(read_request);
            }
        }
    }
}

// Validate read requests against the historical tree root, for reading settled notes.
// Use their membership witnesses to do so.
fn validate_settled_read_requests<let READ_REQUEST_LEN: u32, let SETTLED_READ_HINTS_LEN: u32, H, let TREE_HEIGHT: u32, LEAF_PREIMAGE>(
    read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
    hints: [H; SETTLED_READ_HINTS_LEN],
    settled_read_amount: u32,
    tree_root: Field,
)
where
    H: SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE> + ReadValueHint,
    LEAF_PREIMAGE: LeafPreimage + Readable<ScopedReadRequest>,
{
    for i in 0..READ_REQUEST_LEN {
        if i < settled_read_amount {
            let hint = hints[i];
            let read_request_index = hint.read_request_index();
            if read_request_index != READ_REQUEST_LEN {
                let read_request = read_requests.array[read_request_index];
                let leaf_preimage = hint.leaf_preimage();
                leaf_preimage.assert_match_read_request(read_request);

                let leaf = leaf_preimage.as_leaf();
                let witness = hint.membership_witness();
                assert_check_membership(leaf, witness.leaf_index, witness.sibling_path, tree_root);
            }
        }
    }
}

fn verify_propagated_read_requests<let READ_REQUEST_LEN: u32, let PENDING_READ_HINTS_LEN: u32, T, let SETTLED_READ_HINTS_LEN: u32, S>(
    read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
    pending_read_hints: [T; PENDING_READ_HINTS_LEN],
    pending_read_amount: u32,
    settled_read_hints: [S; SETTLED_READ_HINTS_LEN],
    settled_read_amount: u32,
    propagated_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
)
where
    T: ReadValueHint,
    S: ReadValueHint,
{
    let mut num_propagated = 0;
    for i in 0..READ_REQUEST_LEN {
        let read_request = read_requests.array[i];
        let status = read_request_actions[i];
        if status.action_enum == ReadRequestActions.READ_AS_PENDING {
            assert_eq(
                pending_read_hints[status.hint_index].read_request_index(),
                i,
                "Hinted pending read request does not match status",
            );
        } else if status.action_enum == ReadRequestActions.READ_AS_SETTLED {
            assert_eq(
                settled_read_hints[status.hint_index].read_request_index(),
                i,
                "Hinted settled read request does not match status",
            );
        } else {
            assert_eq(
                propagated_read_requests.array[num_propagated],
                read_request,
                "Mismatch propagated read request",
            );
            num_propagated += 1;
        }
    }

    // Check that those hints not being used in validate_pending_read_requests() (index >= pending_read_amount)
    // are set to READ_REQUEST_LEN.
    // This is to ensure that the unused hints are not referred to in the above to skip propagating the read requests.
    for i in 0..PENDING_READ_HINTS_LEN {
        if i >= pending_read_amount {
            assert_eq(
                pending_read_hints[i].read_request_index(),
                READ_REQUEST_LEN,
                "Unused pending read hint should not point to a read request",
            );
        }
    }
    for i in 0..SETTLED_READ_HINTS_LEN {
        if i >= settled_read_amount {
            assert_eq(
                settled_read_hints[i].read_request_index(),
                READ_REQUEST_LEN,
                "Unused settled read hint should not point to a read request",
            );
        }
    }
}

// For best performance, `pending_read_amount` and `settled_read_amount` should be known at compile time,
// `pending_read_amount` should be the same as `PENDING_READ_HINTS_LEN`,
// and `settled_read_amount` the same as `SETTLED_READ_HINTS_LEN`.
// We created two variables because an array is not allowed to be empty (zero length). In the case a reset circuit skips
// the read request verification, the array will contain empty items, and the [pending|settled]_read_amount will be zero.
pub fn verify_reset_read_requests<let READ_REQUEST_LEN: u32, P, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32, H, let TREE_HEIGHT: u32, LEAF_PREIMAGE>(
    read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
    pending_values: AppendedUnvalidatedArray<P, PENDING_VALUE_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
    pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
    pending_read_amount: u32,
    settled_read_hints: [H; SETTLED_READ_HINTS_LEN],
    settled_read_amount: u32,
    tree_root: Field,
    propagated_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
)
where
    P: Readable<ScopedReadRequest>,
    H: SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE> + ReadValueHint,
    LEAF_PREIMAGE: LeafPreimage + Readable<ScopedReadRequest>,
{
    validate_pending_read_requests(
        read_requests,
        pending_values,
        pending_read_hints,
        pending_read_amount,
    );

    validate_settled_read_requests(
        read_requests,
        settled_read_hints,
        settled_read_amount,
        tree_root,
    );

    verify_propagated_read_requests(
        read_requests,
        read_request_actions,
        pending_read_hints,
        pending_read_amount,
        settled_read_hints,
        settled_read_amount,
        propagated_read_requests,
    );
}

pub unconstrained fn get_skipped_read_requests<let READ_REQUEST_LEN: u32>(
    read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
) -> AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN> {
    let mut propagated_read_requests = AppendedUnvalidatedArray::empty();
    for i in 0..READ_REQUEST_LEN {
        let read_request = read_requests.array[i];

        // Q: Why don't we just pop a subarray of read_requests off the pile, and process those?
        // A: Unlike key validation request, we can't always process the first N read requests,
        // because some of them might be reading a pending note hash that's not included yet.
        if read_request_actions[i].action_enum == ReadRequestActions.SKIP {
            propagated_read_requests.push(read_request);
        }
    }
    propagated_read_requests
}

mod tests {
    use crate::reset::read_request::{
        get_skipped_read_requests, PendingReadHint, ReadRequestAction, ReadRequestActions,
        ReadValueHint, SettledReadHint, validate_pending_read_requests,
        validate_settled_read_requests, verify_reset_read_requests,
    };
    use dep::types::{
        abis::{read_request::{ReadRequest, ScopedReadRequest}, side_effect::Readable},
        address::AztecAddress,
        merkle_tree::{LeafPreimage, MembershipWitness},
        tests::{merkle_tree_utils::NonEmptyMerkleTree, utils::{assert_array_eq, pad_end}},
        traits::{Empty, FromField},
        utils::arrays::AppendedUnvalidatedArray,
    };

    fn silo_test_value(value: Field) -> Field {
        value + 9999
    }

    struct TestValue {
        value: Field,
        counter: u32,
    }

    impl Readable<ScopedReadRequest> for TestValue {
        fn assert_match_read_request(self, read_request: ScopedReadRequest) {
            let siloed_value = silo_test_value(read_request.value());
            assert_eq(self.value, siloed_value, "Hinted test value does not match");
        }
    }

    #[derive(Eq)]
    struct TestLeafPreimage {
        value: Field,
    }

    impl LeafPreimage for TestLeafPreimage {
        fn get_key(self) -> Field {
            self.value
        }

        fn as_leaf(self) -> Field {
            silo_test_value(self.value)
        }
    }

    impl Empty for TestLeafPreimage {
        fn empty() -> Self {
            TestLeafPreimage { value: 0 }
        }
    }

    impl Readable<ScopedReadRequest> for TestLeafPreimage {
        fn assert_match_read_request(self, read_request: ScopedReadRequest) {
            let siloed_value = silo_test_value(read_request.value());
            assert_eq(siloed_value, self.value, "Provided leaf preimage is not for target value");
        }
    }

    struct TestSettledReadHint {
        read_request_index: u32,
        membership_witness: MembershipWitness<3>,
        leaf_preimage: TestLeafPreimage,
    }

    impl ReadValueHint for TestSettledReadHint {
        fn read_request_index(self) -> u32 {
            self.read_request_index
        }
    }

    impl SettledReadHint<3, TestLeafPreimage> for TestSettledReadHint {
        fn membership_witness(self) -> MembershipWitness<3> {
            self.membership_witness
        }

        fn leaf_preimage(self) -> TestLeafPreimage {
            self.leaf_preimage
        }

        fn skip(read_request_len: u32) -> Self {
            TestSettledReadHint {
                read_request_index: read_request_len,
                membership_witness: MembershipWitness::empty(),
                leaf_preimage: TestLeafPreimage::empty(),
            }
        }
    }

    struct TestBuilder<let READ_REQUEST_LEN: u32, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> {
        read_requests: AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN>,
        read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
        pending_values: AppendedUnvalidatedArray<TestValue, PENDING_VALUE_LEN>,
        pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
        leaf_preimages: [TestLeafPreimage; SETTLED_READ_HINTS_LEN],
        pending_read_amount: u32,
        settled_read_amount: u32,
    }

    impl TestBuilder<4, 2, 2, 2> {
        pub fn new() -> Self {
            let contract_address = AztecAddress::from_field(123);

            // Create 4 values. 10 and 11 are settled. 12 and 13 are pending.
            let values = [10, 11, 12, 13];
            let siloed_values = values.map(|n| silo_test_value(n));

            // Create 4 read requests. 0 and 3 are reading settled values. 1 and 2 are reading pending values.
            let read_requests = AppendedUnvalidatedArray {
                array: [
                    ReadRequest { value: values[1], counter: 11 }.scope(contract_address), // settled
                    ReadRequest { value: values[3], counter: 13 }.scope(contract_address), // pending
                    ReadRequest { value: values[2], counter: 39 }.scope(contract_address), // pending
                    ReadRequest { value: values[0], counter: 46 }.scope(contract_address), // settled
                ],
                length: 4,
            };

            let pending_values = AppendedUnvalidatedArray {
                array: [
                    TestValue { value: siloed_values[2], counter: 2 },
                    TestValue { value: siloed_values[3], counter: 8 },
                ],
                length: 2,
            };

            let pending_read_hints = [
                PendingReadHint { read_request_index: 1, pending_value_index: 1 },
                PendingReadHint { read_request_index: 2, pending_value_index: 0 },
            ];

            let leaf_preimages = [
                TestLeafPreimage { value: siloed_values[0] },
                TestLeafPreimage { value: siloed_values[1] },
            ];

            let read_request_actions = [
                ReadRequestAction::set_as_settled(0),
                ReadRequestAction::set_as_pending(0),
                ReadRequestAction::set_as_pending(1),
                ReadRequestAction::set_as_settled(1),
            ];

            TestBuilder {
                read_requests,
                read_request_actions,
                pending_values,
                pending_read_hints,
                leaf_preimages,
                pending_read_amount: pending_read_hints.len(),
                settled_read_amount: leaf_preimages.len(),
            }
        }
    }

    impl<let READ_REQUEST_LEN: u32, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> TestBuilder<READ_REQUEST_LEN, PENDING_VALUE_LEN, PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN> {
        fn build_tree(self) -> NonEmptyMerkleTree<2, 3, 2, 1> {
            NonEmptyMerkleTree::new(
                [self.leaf_preimages[0].as_leaf(), self.leaf_preimages[1].as_leaf()],
                [0; 3],
                [0; 2],
                [0; 1],
            )
        }

        pub fn get_settled_read_hints(
            self,
        ) -> ([TestSettledReadHint; SETTLED_READ_HINTS_LEN], Field) {
            let tree = self.build_tree();
            let hints = pad_end(
                [
                    TestSettledReadHint {
                        read_request_index: 0,
                        membership_witness: MembershipWitness {
                            leaf_index: 1,
                            sibling_path: tree.get_sibling_path(1),
                        },
                        leaf_preimage: self.leaf_preimages[1],
                    },
                    TestSettledReadHint {
                        read_request_index: 3,
                        membership_witness: MembershipWitness {
                            leaf_index: 0,
                            sibling_path: tree.get_sibling_path(0),
                        },
                        leaf_preimage: self.leaf_preimages[0],
                    },
                ],
                TestSettledReadHint::skip(READ_REQUEST_LEN),
            );
            let tree_root = tree.get_root();
            (hints, tree_root)
        }

        pub fn get_nada_pending_read_hint(self) -> PendingReadHint {
            PendingReadHint::skip(self.read_requests.array.len())
        }

        pub fn get_nada_settled_read_hint(self) -> TestSettledReadHint {
            TestSettledReadHint::skip(self.read_requests.array.len())
        }

        pub fn get_skipped_read_requests(
            self,
        ) -> AppendedUnvalidatedArray<ScopedReadRequest, READ_REQUEST_LEN> {
            // Safety: this is only used in tests.
            unsafe {
                get_skipped_read_requests(self.read_requests, self.read_request_actions)
            }
        }

        pub fn validate_pending_read_requests(self) {
            validate_pending_read_requests(
                self.read_requests,
                self.pending_values,
                self.pending_read_hints,
                self.pending_read_amount,
            );
        }

        pub fn validate_settled_read_requests(self) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            validate_settled_read_requests(
                self.read_requests,
                settled_hints,
                self.settled_read_amount,
                tree_root,
            );
        }

        pub fn validate_settled_read_requests_with_hints(
            self,
            settled_hints: [TestSettledReadHint; SETTLED_READ_HINTS_LEN],
            tree_root: Field,
        ) {
            validate_settled_read_requests(
                self.read_requests,
                settled_hints,
                self.settled_read_amount,
                tree_root,
            );
        }

        pub fn verify_with_settled_hints(
            self,
            settled_hints: [TestSettledReadHint; SETTLED_READ_HINTS_LEN],
        ) {
            let tree = self.build_tree();
            let unverified = self.get_skipped_read_requests();
            verify_reset_read_requests(
                self.read_requests,
                self.pending_values,
                self.read_request_actions,
                self.pending_read_hints,
                self.pending_read_amount,
                settled_hints,
                self.settled_read_amount,
                tree.get_root(),
                unverified,
            );
        }

        pub fn verify(self) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            let unverified = self.get_skipped_read_requests();
            verify_reset_read_requests(
                self.read_requests,
                self.pending_values,
                self.read_request_actions,
                self.pending_read_hints,
                self.pending_read_amount,
                settled_hints,
                self.settled_read_amount,
                tree_root,
                unverified,
            );
        }
    }

    /**
     * validate_pending_read_requests
     */
    #[test]
    fn validate_pending_read_requests_succeeds() {
        let builder = TestBuilder::new();
        builder.validate_pending_read_requests();
    }

    #[test]
    fn validate_pending_read_requests_partial_succeeds() {
        let mut builder = TestBuilder::new();

        builder.pending_read_hints[1] = builder.get_nada_pending_read_hint();

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Hinted test value does not match")]
    fn validate_pending_read_requests_wrong_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.pending_read_hints[1].pending_value_index += 1;

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Hinted test value does not match")]
    fn validate_pending_read_requests_wrong_hint_after_nada_fails() {
        let mut builder = TestBuilder::new();

        builder.pending_read_hints[0] = builder.get_nada_pending_read_hint();
        builder.pending_read_hints[1].pending_value_index += 1;

        builder.validate_pending_read_requests();
    }

    /**
     * validate_settled_read_requests
     */
    #[test]
    fn validate_settled_read_requests_succeeds() {
        let builder = TestBuilder::new();
        builder.validate_settled_read_requests();
    }

    #[test]
    fn validate_settled_read_requests_partial_succeeds() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, tree_root) = builder.get_settled_read_hints();
        settled_hints[0] = builder.get_nada_settled_read_hint();

        builder.validate_settled_read_requests_with_hints(settled_hints, tree_root);
    }

    #[test(should_fail_with = "membership check failed")]
    fn validate_settled_read_requests_wrong_leaf_index_fails() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, tree_root) = builder.get_settled_read_hints();
        settled_hints[0].membership_witness.leaf_index += 1;

        builder.validate_settled_read_requests_with_hints(settled_hints, tree_root);
    }

    #[test(should_fail_with = "Provided leaf preimage is not for target value")]
    fn validate_settled_read_requests_wrong_preimage_value_fails() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, tree_root) = builder.get_settled_read_hints();
        settled_hints[0].leaf_preimage.value += 1;

        builder.validate_settled_read_requests_with_hints(settled_hints, tree_root);
    }

    #[test(should_fail_with = "membership check failed")]
    fn validate_settled_read_requests_wrong_path_after_nada_fails() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, tree_root) = builder.get_settled_read_hints();
        settled_hints[0] = builder.get_nada_settled_read_hint();
        settled_hints[1].membership_witness.sibling_path[0] += 1;

        builder.validate_settled_read_requests_with_hints(settled_hints, tree_root);
    }

    /**
     * verify_reset_read_requests
     */
    #[test]
    fn verify_read_requests_clears_all_succeeds() {
        let builder = TestBuilder::new();
        let unverified_read_requests = builder.get_skipped_read_requests();
        assert(unverified_read_requests.is_empty());

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_partial_succeeds() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[0] = ReadRequestAction::empty();
        builder.read_request_actions[2] = ReadRequestAction::empty();
        builder.pending_read_hints[1] = builder.get_nada_pending_read_hint();

        let mut (settled_hints, _) = builder.get_settled_read_hints();
        settled_hints[0] = builder.get_nada_settled_read_hint();

        let read_requests = builder.read_requests;
        let unverified_read_requests = builder.get_skipped_read_requests();
        assert_array_eq(
            unverified_read_requests.array,
            [read_requests.array[0], read_requests.array[2]],
        );

        builder.verify_with_settled_hints(settled_hints);
    }

    #[test(should_fail_with = "Hinted pending read request does not match status")]
    fn verify_reset_read_requests_wrong_pending_read_status_fails() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[0].action_enum = ReadRequestActions.READ_AS_PENDING;

        builder.verify();
    }

    #[test(should_fail_with = "Hinted settled read request does not match status")]
    fn verify_reset_read_requests_wrong_settled_read_status_fails() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[2].action_enum = ReadRequestActions.READ_AS_SETTLED;

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_with_fewer_pending_verification_amount_succeeds() {
        let mut builder = TestBuilder::new();

        // Only verify 1 pending request.
        builder.pending_read_amount = 1;
        // Clear the status.
        let request_index = builder.pending_read_hints[1].read_request_index;
        builder.read_request_actions[request_index] = ReadRequestAction::set_as_skip();
        // Clear the hint.
        builder.pending_read_hints[1] = PendingReadHint::skip(builder.read_requests.array.len());

        builder.verify();

        let read_request = builder.read_requests.array[request_index];
        let unverified = builder.get_skipped_read_requests();
        assert_array_eq(unverified.array, [read_request]);
    }

    #[test(should_fail_with = "Unused pending read hint should not point to a read request")]
    fn verify_reset_read_requests_with_fewer_pending_verification_amount_extra_hint_fails() {
        let mut builder = TestBuilder::new();

        // Only verify 1 pending request.
        builder.pending_read_amount = 1;
        let request_index = builder.pending_read_hints[1].read_request_index;
        builder.read_request_actions[request_index] = ReadRequestAction::set_as_skip();
        // The hint at index 1 is not removed, but it should be.

        builder.verify();
    }

    #[test(should_fail_with = "Hinted pending read request does not match status")]
    fn verify_reset_read_requests_with_fewer_pending_verification_amount_wrong_status_fails() {
        let mut builder = TestBuilder::new();

        // Only verify 1 pending request.
        builder.pending_read_amount = 1;
        builder.pending_read_hints[1] = PendingReadHint::skip(builder.read_requests.array.len());
        // The status for the read request is still READ_AS_PENDING.

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_with_fewer_settled_verification_amount_succeeds() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, _) = builder.get_settled_read_hints();
        // Only verify 1 settled request.
        builder.settled_read_amount = 1;
        // Clear the status.
        let request_index = settled_hints[1].read_request_index;
        builder.read_request_actions[request_index] = ReadRequestAction::set_as_skip();
        // Clear the hint.
        settled_hints[1] = builder.get_nada_settled_read_hint();

        builder.verify_with_settled_hints(settled_hints);

        let read_request = builder.read_requests.array[request_index];
        let unverified = builder.get_skipped_read_requests();
        assert_array_eq(unverified.array, [read_request]);
    }

    #[test(should_fail_with = "Unused settled read hint should not point to a read request")]
    fn verify_reset_read_requests_with_fewer_settled_verification_amount_extra_hint_fails() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, _) = builder.get_settled_read_hints();
        // Only verify 1 settled request.
        builder.settled_read_amount = 1;
        // Clear the status.
        let request_index = settled_hints[1].read_request_index;
        builder.read_request_actions[request_index] = ReadRequestAction::set_as_skip();
        // The hint at index 1 is not removed, but it should be.

        builder.verify_with_settled_hints(settled_hints);
    }

    #[test(should_fail_with = "Hinted settled read request does not match status")]
    fn verify_reset_read_requests_with_fewer_settled_verification_amount_wrong_status_fails() {
        let mut builder = TestBuilder::new();

        let mut (settled_hints, _) = builder.get_settled_read_hints();
        // Only verify 1 settled request.
        builder.settled_read_amount = 1;
        // Clear the hint.
        settled_hints[1] = builder.get_nada_settled_read_hint();
        // The status for the read request is still READ_AS_SETTLED.

        builder.verify_with_settled_hints(settled_hints);
    }
}
