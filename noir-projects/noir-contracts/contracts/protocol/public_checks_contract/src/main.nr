mod test;
pub mod utils;

use dep::aztec::macros::aztec;

/// The purpose of this contract is to perform a check in public without revealing what contract enqueued the public
/// call. This can be achieved by enqueueing an `incognito` public call.
///
/// Note that this contract should not be grouped with protocol contracts as it is not part of the protocol. We keep
/// it here for now as it allows us to use hardcoded address.
#[aztec]
pub contract PublicChecks {
    use aztec::{macros::functions::{external, view}, utils::comparison::compare};

    // docs:start:check_timestamp
    /// Asserts that the current timestamp satisfies the `operation` with respect
    /// to the `value.
    #[external("public")]
    #[view]
    fn check_timestamp(operation: u8, value: u64) {
        let lhs_field = self.context.timestamp() as Field;
        let rhs_field = value as Field;
        assert(compare(lhs_field, operation, rhs_field), "Timestamp mismatch.");
    }
    // docs:end:check_timestamp

    /// Asserts that the current block number satisfies the `operation` with respect
    /// to the `value.
    #[external("public")]
    #[view]
    fn check_block_number(operation: u8, value: u32) {
        assert(
            compare(
                self.context.block_number() as Field,
                operation,
                value as Field,
            ),
            "Block number mismatch.",
        );
    }
}
