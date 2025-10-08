mod read_request_hints_builder;
mod settled_read_tests;
mod pending_read_tests;
mod propagated_read_tests;
mod read_request_validator_tests;

use super::{
    get_propagated_read_requests::get_propagated_read_requests,
    read_request_validator::ReadRequestValidator,
};
use dep::types::{
    abis::{read_request::{ReadRequest, ScopedReadRequest}, side_effect::{Ordered, Readable}},
    address::AztecAddress,
    merkle_tree::{LeafPreimage, MembershipWitness},
    tests::{merkle_tree_utils::SingleSubtreeMerkleTree, utils::pad_end},
    traits::{Empty, FromField},
    utils::arrays::ClaimedLengthArray,
};
pub use read_request_hints_builder::ReadRequestHintsBuilder;

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

impl Ordered for TestValue {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Readable<ScopedReadRequest> for TestValue {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        assert_eq(
            read_request.value(),
            self.value,
            "Hinted test value does not match read request",
        );
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
        self.value
    }
}

impl Empty for TestLeafPreimage {
    fn empty() -> Self {
        TestLeafPreimage { value: 0 }
    }
}

impl Readable<ScopedReadRequest> for TestLeafPreimage {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        assert_eq(
            read_request.value(),
            self.value,
            "Hinted test leaf preimage does not match read request",
        );
    }
}

global READ_REQUEST_LEN: u32 = 10;
global PENDING_VALUE_LEN: u32 = 8;
global PENDING_READ_HINTS_LEN: u32 = 5;
global SETTLED_READ_HINTS_LEN: u32 = 4;

global TEST_TREE_HEIGHT: u32 = 3;
global TEST_SUBTREE_HEIGHT: u32 = 2;
global TEST_SUBTREE_WIDTH: u32 = 1 << TEST_SUBTREE_HEIGHT;

// The contract address value doesn't matter for the tests.
global TEST_CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(123);

struct TestBuilder {
    read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    pending_values: ClaimedLengthArray<TestValue, PENDING_VALUE_LEN>,
    tree: SingleSubtreeMerkleTree<TEST_SUBTREE_WIDTH, TEST_SUBTREE_HEIGHT, TEST_TREE_HEIGHT>,
    tree_root: Field,
    leaf_preimages: [TestLeafPreimage; TEST_SUBTREE_WIDTH],
    propagated_read_requests: ClaimedLengthArray<ScopedReadRequest, READ_REQUEST_LEN>,
    hints: ReadRequestHintsBuilder<READ_REQUEST_LEN, PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN, TEST_TREE_HEIGHT, TestLeafPreimage>,
    counter: u32,
}

impl TestBuilder {
    /// Create a new builder with pending values and leaf preimages, but no read requests.
    pub fn new() -> Self {
        let pending_values = ClaimedLengthArray {
            array: pad_end([
                TestValue { value: 55, counter: 5 },
                TestValue { value: 66, counter: 6 },
                TestValue { value: 77, counter: 7 },
                TestValue { value: 88, counter: 8 },
            ]),
            length: 4,
        };

        let leaf_preimages = [
            TestLeafPreimage { value: 111 },
            TestLeafPreimage { value: 222 },
            TestLeafPreimage { value: 333 },
            TestLeafPreimage { value: 444 },
        ];

        let tree = SingleSubtreeMerkleTree::<TEST_SUBTREE_WIDTH, TEST_SUBTREE_HEIGHT, TEST_TREE_HEIGHT>::new(
            leaf_preimages.map(|preimage| preimage.as_leaf()),
        );

        let tree_root = tree.get_root();

        TestBuilder {
            read_requests: ClaimedLengthArray::empty(),
            pending_values,
            leaf_preimages,
            tree,
            tree_root,
            propagated_read_requests: ClaimedLengthArray::empty(),
            hints: ReadRequestHintsBuilder::new(),
            // Start from a counter larger than the pending values' counters.
            counter: 10,
        }
    }

    pub fn add_read_request(&mut self, value: Field) -> u32 {
        let read_request_index = self.read_requests.length;
        let read_request =
            ReadRequest { value, counter: self.counter }.scope(TEST_CONTRACT_ADDRESS);
        self.read_requests.push(read_request);
        self.counter += 1;
        read_request_index
    }

    pub fn add_pending_read(&mut self, pending_value_index: u32) {
        let pending_value = self.pending_values.array[pending_value_index];
        let read_request_index = self.add_read_request(pending_value.value);
        self.hints.add_pending_read_hint(read_request_index, pending_value_index);
    }

    pub fn add_settled_read(&mut self, leaf_preimage_index: u32) {
        let leaf_preimage = self.leaf_preimages[leaf_preimage_index];
        let read_request_index = self.add_read_request(leaf_preimage.value);

        let leaf_index = leaf_preimage_index as Field;
        let membership_witness =
            MembershipWitness { leaf_index, sibling_path: self.tree.get_sibling_path(leaf_index) };

        self.hints.add_settled_read_hint(read_request_index, membership_witness, leaf_preimage);
    }

    pub fn build_propagated_read_requests(&mut self) {
        // Safety: this is only used in tests.
        self.propagated_read_requests = unsafe {
            get_propagated_read_requests(self.read_requests, self.hints.read_request_actions)
        }
    }

    pub fn validate(self) {
        self.validate_with_amount::<PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN>();
    }

    pub fn validate_with_amount<let PendingReadAmount: u32, let SettledReadAmount: u32>(self) {
        ReadRequestValidator {
            read_requests: self.read_requests,
            pending_values: self.pending_values,
            tree_root: self.tree_root,
            propagated_read_requests: self.propagated_read_requests,
            hints: self.hints.to_hints(),
        }
            .validate::<PendingReadAmount, SettledReadAmount>();
    }
}
