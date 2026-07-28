use aztec::macros::aztec;

// Test contract covering behavior around the MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS limit.
#[aztec]
pub contract CalldataLimitTest {
    use aztec::macros::functions::{external, only_self};
    use aztec::protocol::constants::MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS;

    // Each call contributes MAX/3 args + 1 function-selector field. Three such calls total MAX + 3, over the limit.
    #[external("public")]
    #[only_self]
    fn public_call_with_third_of_max_args(_args: [Field; MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 3]) {}

    // Enqueues three public calls split across a parent/nested-private-call boundary: one from the parent, one from
    // the nested call, and one more from the parent after the nested call returns. Expected to fail during private
    // simulation: each individual frame's calldata total stays under the limit, but the tree-wide total is over.
    #[external("private")]
    fn exceed_calldata_limit_via_nested_call() {
        let args = [0; MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 3];
        self.enqueue_self.public_call_with_third_of_max_args(args);
        self.call_self.enqueue_one_public_call();
        self.enqueue_self.public_call_with_third_of_max_args(args);
    }

    #[external("private")]
    fn enqueue_one_public_call() {
        let args = [0; MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 3];
        self.enqueue_self.public_call_with_third_of_max_args(args);
    }
}
