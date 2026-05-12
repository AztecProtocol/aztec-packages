use crate::{
    context::{calls::PublicStaticCall, PrivateContext},
    protocol::{abis::function_selector::FunctionSelector, address::AztecAddress, constants::PUBLIC_CHECKS_ADDRESS},
};

/// Hand-written interface stub for the `PublicChecks` canonical contract.
///
/// The `PublicChecks` contract exposes two view functions that can be enqueued
/// from private context via `enqueue_view_incognito` to assert timestamp or
/// block-number constraints without revealing the calling contract address.
///
/// This stub exists so that the `public_checks_contract` crate itself does not
/// need to depend on `canonical_addresses` (which would create a structural
/// cycle). Consumer contracts call the helpers below directly via
/// `use aztec::public_checks::*` without taking a dep on the contract crate.
///
/// The selectors are derived with `comptime { FunctionSelector::from_signature(...) }`,
/// which matches exactly what the `#[aztec]` macro generates for the real contract.
struct PublicChecksInterface {
    target_contract: AztecAddress,
}

impl PublicChecksInterface {
    pub fn at(target_contract: AztecAddress) -> Self {
        Self { target_contract }
    }

    /// Returns a `PublicStaticCall` that asserts `timestamp <op> value`.
    pub fn check_timestamp(self, operation: u8, value: u64) -> PublicStaticCall<15, 2, ()> {
        let selector = comptime { FunctionSelector::from_signature("check_timestamp(u8,u64)") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "check_timestamp",
            [operation as Field, value as Field],
        )
    }

    /// Returns a `PublicStaticCall` that asserts `block_number <op> value`.
    pub fn check_block_number(self, operation: u8, value: u32) -> PublicStaticCall<18, 2, ()> {
        let selector = comptime { FunctionSelector::from_signature("check_block_number(u8,u32)") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "check_block_number",
            [operation as Field, value as Field],
        )
    }
}

// docs:start:helper_public_checks_functions
/// Asserts that the current timestamp in the enqueued public call enqueued by `check_timestamp` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks
/// contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract
/// address.
pub fn privately_check_timestamp(operation: u8, value: u64, context: &mut PrivateContext) {
    PublicChecksInterface::at(PUBLIC_CHECKS_ADDRESS).check_timestamp(operation, value).enqueue_view_incognito(context);
}

/// Asserts that the current block number in the enqueued public call enqueued by `check_block_number` satisfies
/// the `operation` with respect to the `value. Preserves privacy by performing the check via the public checks
/// contract.
/// This conceals an address of the calling contract by setting `context.msg_sender` to the public checks contract
/// address.
pub fn privately_check_block_number(operation: u8, value: u32, context: &mut PrivateContext) {
    // docs:start:enqueueing
    PublicChecksInterface::at(PUBLIC_CHECKS_ADDRESS).check_block_number(operation, value).enqueue_view_incognito(context);
    // docs:end:enqueueing
}
// docs:end:helper_public_checks_functions
