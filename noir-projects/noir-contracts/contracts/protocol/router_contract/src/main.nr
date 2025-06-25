mod test;
mod utils;

use dep::aztec::macros::aztec;

/// The purpose of this contract is to perform a check in public without revealing what contract enqueued the public
/// call. This is achieved by having a private function on this contract that enqueues the public call and hence
/// the `msg_sender` in the public call is the address of this contract.
#[aztec]
pub contract Router {
    use aztec::{macros::functions::{internal, private, public, view}, utils::comparison::compare};

    // docs:start:check_timestamp
    /// Asserts that the current timestamp in the enqueued public call satisfies the `operation` with respect
    /// to the `value.
    #[private]
    fn check_timestamp(operation: u8, value: u64) {
        Router::at(context.this_address())._check_timestamp(operation, value).enqueue_view(
            &mut context,
        );
    }

    #[public]
    #[internal]
    #[view]
    fn _check_timestamp(operation: u8, value: u64) {
        let lhs_field = context.timestamp() as Field;
        let rhs_field = value as Field;
        assert(compare(lhs_field, operation, rhs_field), "Timestamp mismatch.");
    }
    // docs:end:check_timestamp

    /// Asserts that the current block number in the enqueued public call satisfies the `operation` with respect
    /// to the `value.
    #[private]
    fn check_block_number(operation: u8, value: u32) {
        Router::at(context.this_address())._check_block_number(operation, value).enqueue_view(
            &mut context,
        );
    }

    #[public]
    #[internal]
    #[view]
    fn _check_block_number(operation: u8, value: u32) {
        assert(
            compare(context.block_number() as Field, operation, value as Field),
            "Block number mismatch.",
        );
    }
}
