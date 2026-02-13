use crate::PublicChecks;
use aztec::context::PrivateContext;
use aztec::protocol::address::AztecAddress;

// docs:start:helper_public_checks_functions
/// Asserts that the current timestamp in the enqueued public call enqueued by `check_timestamp` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract address.
pub fn privately_check_timestamp(
    operation: u8,
    value: u64,
    context: &mut PrivateContext,
    public_checks_address: AztecAddress,
) {
    PublicChecks::at(public_checks_address)
        .check_timestamp(operation, value)
        .enqueue_view_incognito(context);
}

/// Asserts that the current block number in the enqueued public call enqueued by `check_block_number` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract address.
pub fn privately_check_block_number(
    operation: u8,
    value: u32,
    context: &mut PrivateContext,
    public_checks_address: AztecAddress,
) {
    // docs:start:enqueueing
    PublicChecks::at(public_checks_address)
        .check_block_number(operation, value)
        .enqueue_view_incognito(context);
    // docs:end:enqueueing
}
// docs:end:helper_public_checks_functions
