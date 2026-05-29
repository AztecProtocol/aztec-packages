use crate::context::calls::PublicStaticCall;
use crate::context::PrivateContext;
use crate::protocol::abis::function_selector::FunctionSelector;
use crate::protocol::constants::PUBLIC_CHECKS_ADDRESS;

// docs:start:helper_public_checks_functions
/// Asserts that the current timestamp in the enqueued public call enqueued by `check_timestamp` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks
/// contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract
/// address.
pub fn privately_check_timestamp(operation: u8, value: u64, context: &mut PrivateContext) {
    let selector = comptime { FunctionSelector::from_signature("check_timestamp(u8,u64)") };
    PublicStaticCall::<15, 2, ()>::new(
        PUBLIC_CHECKS_ADDRESS,
        selector,
        "check_timestamp",
        [operation as Field, value as Field],
    )
        .enqueue_view_incognito(context);
}

/// Asserts that the current block number in the enqueued public call enqueued by `check_block_number` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks
/// contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract
/// address.
pub fn privately_check_block_number(operation: u8, value: u32, context: &mut PrivateContext) {
    // docs:start:enqueueing
    let selector = comptime { FunctionSelector::from_signature("check_block_number(u8,u32)") };
    PublicStaticCall::<18, 2, ()>::new(
        PUBLIC_CHECKS_ADDRESS,
        selector,
        "check_block_number",
        [operation as Field, value as Field],
    )
        .enqueue_view_incognito(context);
    // docs:end:enqueueing
}
// docs:end:helper_public_checks_functions
