use dep::types::{
    abis::{read_request::ScopedReadRequest, side_effect::Readable},
    merkle_tree::{assert_check_membership, LeafPreimage, MembershipWitness},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

struct ReadRequestActionEnum {
    pub SKIP: u8,
    pub READ_AS_PENDING: u8,
    pub READ_AS_SETTLED: u8,
}

pub global ReadRequestActions: ReadRequestActionEnum =
    ReadRequestActionEnum { SKIP: 0, READ_AS_PENDING: 1, READ_AS_SETTLED: 2 };

#[derive(Eq)]
pub struct ReadRequestAction {
    pub action: u8,
    pub hint_index: u32,
}

impl Empty for ReadRequestAction {
    fn empty() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }
}

impl ReadRequestAction {
    pub fn set_as_skip() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }

    pub fn set_as_pending(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index }
    }

    pub fn set_as_settled(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_SETTLED, hint_index }
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
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    pending_values: ClaimedLengthArray<T, PENDING_VALUE_LEN>,
    hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
)
where
    T: Readable<ScopedReadRequest>,
{
    for i in 0..PENDING_READ_HINTS_LEN {
        let hint = hints[i];
        let read_request_index = hint.read_request_index;
        let pending_value_index = hint.pending_value_index;
        if read_request_index != READ_REQUEST_LEN {
            assert(
                pending_value_index < pending_values.length,
                "Cannot read a pending value beyond claimed length",
            );
            let read_request = read_requests.array[read_request_index];
            let pending_value = pending_values.array[hint.pending_value_index];
            pending_value.assert_match_read_request(read_request);
        }
    }
}

// Validate read requests against the historical tree root, for reading settled notes.
// Use their membership witnesses to do so.
fn validate_settled_read_requests<let READ_REQUEST_LEN: u32, let SETTLED_READ_HINTS_LEN: u32, H, let TREE_HEIGHT: u32, LEAF_PREIMAGE>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    hints: [H; SETTLED_READ_HINTS_LEN],
    tree_root: Field,
)
where
    H: SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE> + ReadValueHint,
    LEAF_PREIMAGE: LeafPreimage + Readable<ScopedReadRequest>,
{
    for i in 0..SETTLED_READ_HINTS_LEN {
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

fn verify_propagated_read_requests<let READ_REQUEST_LEN: u32, let PENDING_READ_HINTS_LEN: u32, T, let SETTLED_READ_HINTS_LEN: u32, S>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
    pending_read_hints: [T; PENDING_READ_HINTS_LEN],
    settled_read_hints: [S; SETTLED_READ_HINTS_LEN],
    propagated_read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
)
where
    T: ReadValueHint,
    S: ReadValueHint,
{
    let mut num_propagated = 0;
    for i in 0..READ_REQUEST_LEN {
        let read_request = read_requests.array[i];
        let status = read_request_actions[i];
        if status.action == ReadRequestActions.READ_AS_PENDING {
            // Ensure the pending hint correctly refers to this read request.
            // The hint would've been used in validate_pending_read_requests to validate this read request.
            assert_eq(
                pending_read_hints[status.hint_index].read_request_index(),
                i,
                "Hinted pending read request does not match status",
            );
        } else if status.action == ReadRequestActions.READ_AS_SETTLED {
            // Ensure the settled hint correctly refers to this read request.
            // The hint would've been used in validate_settled_read_requests to validate this read request.
            assert_eq(
                settled_read_hints[status.hint_index].read_request_index(),
                i,
                "Hinted settled read request does not match status",
            );
        } else {
            // This read request is being propagated.

            // We don't need to check whether the pending or settled hint is set to READ_REQUEST_LEN.
            // If a hint is incorrectly set, we may propagate a read request that's already been validated.
            // This isn't a security issue, but it's inefficient, since the user would need to run a reset circuit again
            // to clear all read requests.

            assert_eq(
                propagated_read_requests.array[num_propagated],
                read_request,
                "Mismatch propagated read request",
            );

            if i < read_requests.length {
                // Only count the propagated read request if it's within the claimed length.
                // Without this check, we'd be counting all un-validated read requests, even empty ones, and incorrectly
                // include them in the final claimed length.
                //
                // Note: it's cheaper not to include the above `assert_eq` inside this if statement.
                // But if any two read requests beyond the claimed length differ, the assertion will fail,
                // because num_propagated will no longer be incremented and both will refer to the same index
                // in propagated_read_requests.
                // This doesn't allow the extra read requests to override the valid read requests being propagated.
                num_propagated += 1;
            }
        }
    }

    assert_eq(
        propagated_read_requests.length,
        num_propagated,
        "Incorrect propagated read requests length",
    );
}

// For best performance, `pending_read_amount` and `settled_read_amount` should be known at compile time,
// `pending_read_amount` should be the same as `PENDING_READ_HINTS_LEN`,
// and `settled_read_amount` the same as `SETTLED_READ_HINTS_LEN`.
// We created two variables because an array is not allowed to be empty (zero length). In the case a reset circuit skips
// the read request verification, the array will contain empty items, and the [pending|settled]_read_amount will be zero.
pub fn verify_reset_read_requests<let READ_REQUEST_LEN: u32, P, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32, H, let TREE_HEIGHT: u32, LEAF_PREIMAGE>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    pending_values: ClaimedLengthArray<P, PENDING_VALUE_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
    pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
    pending_read_amount: u32,
    settled_read_hints: [H; SETTLED_READ_HINTS_LEN],
    settled_read_amount: u32,
    tree_root: Field,
    propagated_read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
)
where
    P: Readable<ScopedReadRequest>,
    H: SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE> + ReadValueHint,
    LEAF_PREIMAGE: LeafPreimage + Readable<ScopedReadRequest>,
{
    if pending_read_amount != 0 {
        // By asserting that pending_read_amount equals the number of hints, we can skip validation
        // of the unused hints (i.e., those with index >= pending_read_amount), as we do when the amount is 0.
        // Because all the hints will be used to validate pending read requests,
        // making it impossible to skip propagating a read request by referring to a hint that's not used.
        assert_eq(
            pending_read_amount,
            PENDING_READ_HINTS_LEN,
            "pending_read_amount should be the same as the number of pending read hints",
        );
        validate_pending_read_requests(read_requests, pending_values, pending_read_hints);
    } else {
        // Ensure all index hints are set to READ_REQUEST_LEN.
        // This guarantees that the hints cannot be used in verify_propagated_read_requests
        // to skip propagating a read request by referencing a valid read_request_index.
        for i in 0..PENDING_READ_HINTS_LEN {
            assert_eq(
                pending_read_hints[i].read_request_index(),
                READ_REQUEST_LEN,
                "Unused pending read hint should not point to a read request",
            );
        }
    }

    if settled_read_amount != 0 {
        // By asserting that settled_read_amount equals the number of hints, we can skip validation
        // of the unused hints (i.e., those with index >= settled_read_amount), as we do when the amount is 0.
        // Because all the hints will be used to validate settled read requests,
        // making it impossible to skip propagating a read request by referring to a hint that's not used.
        assert_eq(
            settled_read_amount,
            SETTLED_READ_HINTS_LEN,
            "settled_read_amount should be the same as the number of settled read hints",
        );
        validate_settled_read_requests(read_requests, settled_read_hints, tree_root);
    } else {
        // Ensure all index hints are set to READ_REQUEST_LEN.
        // This guarantees that the hints cannot be used in verify_propagated_read_requests
        // to skip propagating a read request by referencing a valid read_request_index.
        for i in 0..SETTLED_READ_HINTS_LEN {
            assert_eq(
                settled_read_hints[i].read_request_index(),
                READ_REQUEST_LEN,
                "Unused settled read hint should not point to a read request",
            );
        }
    }

    verify_propagated_read_requests(
        read_requests,
        read_request_actions,
        pending_read_hints,
        settled_read_hints,
        propagated_read_requests,
    );
}

pub unconstrained fn get_propagated_read_requests<let READ_REQUEST_LEN: u32>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
) -> ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN> {
    let mut propagated_read_requests = ClaimedLengthArray::empty();
    for i in 0..read_requests.length {
        let read_request = read_requests.array[i];

        // Q: Why don't we just pop a subarray of read_requests off the pile, and process those?
        // A: Unlike key validation request, we can't always process the first N read requests,
        // because some of them might be reading a pending note hash that's not included yet.
        if read_request_actions[i].action == ReadRequestActions.SKIP {
            propagated_read_requests.push(read_request);
        }
    }

    // If not all read requests are propagated, we must still copy the first item beyond the claimed length into the
    // propagated array to prevent incorrect equality assertions in verify_propagated_read_requests.
    // See the implementation of verify_propagated_read_requests for more details.
    if read_requests.length != READ_REQUEST_LEN {
        let num_propagated = propagated_read_requests.length;
        propagated_read_requests.array[num_propagated] = read_requests.array[read_requests.length];
    }

    propagated_read_requests
}

mod tests {
    use crate::reset::read_request::{
        get_propagated_read_requests, PendingReadHint, ReadRequestAction, ReadRequestActions,
        ReadValueHint, SettledReadHint, validate_pending_read_requests,
        validate_settled_read_requests, verify_reset_read_requests,
    };
    use dep::types::{
        abis::{read_request::{ReadRequest, ScopedReadRequest}, side_effect::Readable},
        address::AztecAddress,
        merkle_tree::{LeafPreimage, MembershipWitness},
        tests::{merkle_tree_utils::NonEmptyMerkleTree, utils::{assert_array_eq, pad_end}},
        traits::{Empty, FromField},
        utils::arrays::{ClaimedLengthArray, find_index_hint},
    };

    fn silo_test_value(value: Field) -> Field {
        value + 9999
    }

    #[derive(Eq)]
    struct TestValue {
        value: Field,
        counter: u32,
    }

    impl Empty for TestValue {
        fn empty() -> Self {
            TestValue { value: 0, counter: 0 }
        }
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

    struct TestSettledReadPartialHint {
        read_request_index: u32,
        leaf_index: u32,
    }

    impl TestSettledReadPartialHint {
        fn skip(read_request_len: u32) -> Self {
            TestSettledReadPartialHint { read_request_index: read_request_len, leaf_index: 0 }
        }
    }
    struct TestBuilder<let READ_REQUEST_LEN: u32, let PENDING_VALUE_LEN: u32, let PENDING_READ_HINTS_LEN: u32, let SETTLED_READ_HINTS_LEN: u32> {
        read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
        read_request_actions: [ReadRequestAction; READ_REQUEST_LEN],
        pending_values: ClaimedLengthArray<TestValue, PENDING_VALUE_LEN>,
        pending_read_hints: [PendingReadHint; PENDING_READ_HINTS_LEN],
        settled_read_partial_hints: [TestSettledReadPartialHint; SETTLED_READ_HINTS_LEN],
        leaf_preimages: [TestLeafPreimage; SETTLED_READ_HINTS_LEN],
        pending_read_amount: u32,
        settled_read_amount: u32,
    }

    impl TestBuilder<4, 3, 3, 2> {
        pub fn new() -> Self {
            let contract_address = AztecAddress::from_field(123);

            // Create 4 values. 10 and 11 are settled. 12 and 13 are pending.
            let values = [10, 11, 12, 13];
            let siloed_values = values.map(|n| silo_test_value(n));

            // Create 4 read requests. 0 and 3 are reading settled values. 1 and 2 are reading pending values.
            let read_requests = ClaimedLengthArray {
                array: [
                    ReadRequest { value: values[1], counter: 11 }.scope(contract_address), // settled
                    ReadRequest { value: values[3], counter: 13 }.scope(contract_address), // pending
                    ReadRequest { value: values[2], counter: 39 }.scope(contract_address), // pending
                    ReadRequest { value: values[0], counter: 46 }.scope(contract_address), // settled
                ],
                length: 4,
            };

            let pending_values = ClaimedLengthArray {
                array: pad_end(
                    [
                        TestValue { value: siloed_values[2], counter: 2 },
                        TestValue { value: siloed_values[3], counter: 8 },
                    ],
                    TestValue::empty(),
                ),
                length: 2,
            };

            let pending_read_hints = pad_end(
                [
                    PendingReadHint { read_request_index: 1, pending_value_index: 1 },
                    PendingReadHint { read_request_index: 2, pending_value_index: 0 },
                ],
                PendingReadHint::skip(read_requests.length),
            );

            let leaf_preimages = [
                TestLeafPreimage { value: siloed_values[0] },
                TestLeafPreimage { value: siloed_values[1] },
            ];

            let settled_read_partial_hints = pad_end(
                [
                    TestSettledReadPartialHint { read_request_index: 0, leaf_index: 1 },
                    TestSettledReadPartialHint { read_request_index: 3, leaf_index: 0 },
                ],
                TestSettledReadPartialHint::skip(read_requests.length),
            );

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
                settled_read_partial_hints,
                leaf_preimages,
                pending_read_amount: pending_read_hints.len(),
                settled_read_amount: settled_read_partial_hints.len(),
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

            let hints = self.settled_read_partial_hints.map(|hint| {
                let membership_witness = if hint.read_request_index != READ_REQUEST_LEN {
                    MembershipWitness {
                        leaf_index: hint.leaf_index as Field,
                        sibling_path: tree.get_sibling_path(hint.leaf_index),
                    }
                } else {
                    MembershipWitness::empty()
                };

                let leaf_preimage = if hint.read_request_index != READ_REQUEST_LEN {
                    self.leaf_preimages[hint.leaf_index]
                } else {
                    TestLeafPreimage::empty()
                };

                TestSettledReadHint {
                    read_request_index: hint.read_request_index,
                    membership_witness,
                    leaf_preimage,
                }
            });

            let tree_root = tree.get_root();

            (hints, tree_root)
        }

        pub fn get_skip_pending_read_hint(self) -> PendingReadHint {
            PendingReadHint::skip(self.read_requests.array.len())
        }

        pub fn skip_pending_read(&mut self, read_request_index: u32) {
            // Safety: this is only used in tests.
            let hint_index = unsafe {
                find_index_hint(
                    self.pending_read_hints,
                    |hint| hint.read_request_index() == read_request_index,
                )
                    .unwrap()
            };
            self.pending_read_hints[hint_index] = self.get_skip_pending_read_hint();
            self.read_request_actions[read_request_index] = ReadRequestAction::set_as_skip();
        }

        pub fn skip_settled_read(&mut self, read_request_index: u32) {
            // Safety: this is only used in tests.
            let hint_index = unsafe {
                find_index_hint(
                    self.settled_read_partial_hints,
                    |hint| hint.read_request_index == read_request_index,
                )
                    .unwrap()
            };
            self.settled_read_partial_hints[hint_index] =
                TestSettledReadPartialHint::skip(READ_REQUEST_LEN);
            self.read_request_actions[read_request_index] = ReadRequestAction::set_as_skip();
        }

        pub fn get_propagated_read_requests(
            self,
        ) -> ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN> {
            // Safety: this is only used in tests.
            unsafe {
                get_propagated_read_requests(self.read_requests, self.read_request_actions)
            }
        }

        pub fn validate_pending_read_requests(self) {
            validate_pending_read_requests(
                self.read_requests,
                self.pending_values,
                self.pending_read_hints,
            );
        }

        pub fn validate_settled_read_requests(self) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            validate_settled_read_requests(self.read_requests, settled_hints, tree_root);
        }

        pub fn validate_settled_read_requests_with_hints(
            self,
            settled_hints: [TestSettledReadHint; SETTLED_READ_HINTS_LEN],
            tree_root: Field,
        ) {
            validate_settled_read_requests(self.read_requests, settled_hints, tree_root);
        }

        pub fn verify_with_propagated_read_requests(
            self,
            propagated_read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
        ) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            verify_reset_read_requests(
                self.read_requests,
                self.pending_values,
                self.read_request_actions,
                self.pending_read_hints,
                self.pending_read_amount,
                settled_hints,
                self.settled_read_amount,
                tree_root,
                propagated_read_requests,
            );
        }

        pub fn verify(self) {
            let (settled_hints, tree_root) = self.get_settled_read_hints();
            let propagated_read_requests = self.get_propagated_read_requests();
            verify_reset_read_requests(
                self.read_requests,
                self.pending_values,
                self.read_request_actions,
                self.pending_read_hints,
                self.pending_read_amount,
                settled_hints,
                self.settled_read_amount,
                tree_root,
                propagated_read_requests,
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

        builder.pending_read_hints[1] = builder.get_skip_pending_read_hint();

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Hinted test value does not match")]
    fn validate_pending_read_requests_wrong_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.pending_read_hints[1].pending_value_index += 1;

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Hinted test value does not match")]
    fn validate_pending_read_requests_wrong_hint_after_skipped_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.pending_read_hints[0] = builder.get_skip_pending_read_hint();
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

        builder.skip_settled_read(0);

        builder.validate_settled_read_requests();
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
    fn validate_settled_read_requests_wrong_path_after_skipped_hint_fails() {
        let mut builder = TestBuilder::new();

        builder.skip_settled_read(0);
        let mut (settled_hints, tree_root) = builder.get_settled_read_hints();
        settled_hints[1].membership_witness.sibling_path[0] += 1;

        builder.validate_settled_read_requests_with_hints(settled_hints, tree_root);
    }

    /**
     * verify_reset_read_requests
     */
    #[test]
    fn verify_reset_read_requests_clears_all_succeeds() {
        let builder = TestBuilder::new();

        let propagated_read_requests = builder.get_propagated_read_requests();
        assert(propagated_read_requests.is_empty());

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_partial_succeeds() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[0] = ReadRequestAction::empty();
        builder.skip_pending_read(2);
        builder.skip_settled_read(0);

        let read_requests = builder.read_requests;
        let propagated_read_requests = builder.get_propagated_read_requests();
        assert_array_eq(
            propagated_read_requests.array,
            [read_requests.array[0], read_requests.array[2]],
        );
        assert_eq(propagated_read_requests.length, 2);

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_extra_empty_partial_succeeds() {
        let mut builder = TestBuilder::new();

        builder.skip_pending_read(2);
        builder.skip_settled_read(3);
        // Clear the last two read requests.
        builder.read_requests.array[2] = ScopedReadRequest::empty();
        builder.read_requests.array[3] = ScopedReadRequest::empty();

        let propagated_read_requests = builder.get_propagated_read_requests();
        assert(propagated_read_requests.array.is_empty());
        // The two empty read requests are still counted.
        assert_eq(propagated_read_requests.length, 2);

        builder.verify();
    }

    #[test(should_fail_with = "Hinted pending read request does not match status")]
    fn verify_reset_read_requests_wrong_pending_read_status_fails() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[0].action = ReadRequestActions.READ_AS_PENDING;

        builder.verify();
    }

    #[test(should_fail_with = "Hinted settled read request does not match status")]
    fn verify_reset_read_requests_wrong_settled_read_status_fails() {
        let mut builder = TestBuilder::new();

        builder.read_request_actions[2].action = ReadRequestActions.READ_AS_SETTLED;

        builder.verify();
    }

    #[test(should_fail_with = "pending_read_amount should be the same as the number of pending read hints")]
    fn verify_reset_read_requests_with_fewer_pending_verification_amount_fails() {
        let mut builder = TestBuilder::new();

        // Tweak the pending_read_amount to be less than the number of pending_read_hints.
        builder.pending_read_amount -= 1;

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_with_zero_pending_verification_amount_succeeds() {
        let mut builder = TestBuilder::new();

        // Verify 0 pending request.
        builder.pending_read_amount = 0;
        // Skip all pending reads.
        builder.skip_pending_read(1);
        builder.skip_pending_read(2);

        builder.verify();
    }

    #[test(should_fail_with = "Unused pending read hint should not point to a read request")]
    fn verify_reset_read_requests_with_zero_pending_verification_amount_non_empty_hint_fails() {
        let mut builder = TestBuilder::new();

        // Verify 0 pending read requests.
        builder.pending_read_amount = 0;
        // Skip the pending read at index 1.
        builder.skip_pending_read(1);
        // Keep the pending read at index 2.

        builder.verify();
    }

    #[test(should_fail_with = "settled_read_amount should be the same as the number of settled read hints")]
    fn verify_reset_read_requests_with_fewer_settled_verification_amount_fails() {
        let mut builder = TestBuilder::new();

        // Tweak the settled_read_amount to be less than the number of settled_read_hints.
        builder.settled_read_amount -= 1;

        builder.verify();
    }

    #[test(should_fail_with = "Unused settled read hint should not point to a read request")]
    fn verify_reset_read_requests_with_zero_settled_verification_amount_non_empty_hint_fails() {
        let mut builder = TestBuilder::new();

        // Verify 0 settled read requests.
        builder.settled_read_amount = 0;
        // The hints are not empty, but they should be.

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_items_beyond_claimed_length_one_extra_clears_all_succeeds() {
        let mut builder = TestBuilder::new();

        // Change the claimed length to be 3. Skip the last read request, which is not empty.
        builder.read_requests.length = 3;
        builder.skip_settled_read(3);

        let propagated_read_requests = builder.get_propagated_read_requests();
        assert_eq(propagated_read_requests.length, 0);
        // The extra read request is propagated.
        assert_array_eq(
            propagated_read_requests.array,
            [builder.read_requests.array[3]],
        );

        builder.verify();
    }

    #[test(should_fail_with = "Mismatch propagated read request")]
    fn verify_reset_read_requests_items_beyond_claimed_length_two_extras_fails() {
        let mut builder = TestBuilder::new();

        // Change the claimed length to be 2. Skip the last 2 read requests.
        // Both will be propagated, but to the same index, which should fail.
        builder.read_requests.length = 2;
        builder.skip_pending_read(2);
        builder.skip_settled_read(3);

        builder.verify();
    }

    #[test]
    fn verify_reset_read_requests_items_beyond_claimed_length_two_extras_identical_succeeds() {
        let mut builder = TestBuilder::new();

        // Change the claimed length to be 2. Skip the last 2 read requests.
        builder.read_requests.length = 2;
        builder.skip_pending_read(2);
        builder.skip_settled_read(3);
        // Change the last read request to be the same as the second to last.
        builder.read_requests.array[3] = builder.read_requests.array[2];

        let propagated_read_requests = builder.get_propagated_read_requests();
        assert_eq(propagated_read_requests.length, 0);
        // The extra read request is propagated.
        assert_array_eq(
            propagated_read_requests.array,
            [builder.read_requests.array[2]],
        );

        builder.verify();
    }

    #[test(should_fail_with = "Incorrect propagated read requests length")]
    fn verify_reset_read_requests_items_beyond_claimed_length_extra_propagated_length_fails() {
        let mut builder = TestBuilder::new();

        // Change the claimed length to be 3. Skip the last read request, which is not empty.
        builder.read_requests.length = 3;
        builder.skip_settled_read(3);

        let mut propagated_read_requests = builder.get_propagated_read_requests();
        // Tweak the length to be 4, to include the last read request.
        propagated_read_requests.length = 4;

        builder.verify_with_propagated_read_requests(propagated_read_requests);
    }

    #[test(should_fail_with = "Cannot read a pending value beyond claimed length")]
    fn verify_reset_read_requests_items_beyond_claimed_length_used_as_pending_value_fails() {
        let mut builder = TestBuilder::new();

        // Swap the pending values at index 1 and 2.
        let tmp = builder.pending_values.array[1];
        builder.pending_values.array[1] = builder.pending_values.array[2];
        // This value is beyond the claimed length, but we are trying to read this, which should fail.
        builder.pending_values.array[2] = tmp;

        // Update the hint to point to the matching value, now beyond the claimed length.
        assert_eq(builder.pending_read_hints[0].pending_value_index, 1); // Make sure we are modifying the correct hint.
        builder.pending_read_hints[0].pending_value_index = 2;

        builder.verify();
    }
}
