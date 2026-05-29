use crate::context::calls::PublicStaticCall;
use crate::protocol::abis::function_selector::FunctionSelector;
use crate::protocol::address::AztecAddress;

/// Hand-written interface stub for the `PublicChecks` standard contract.
///
/// The `PublicChecks` contract exposes two view functions that can be enqueued
/// from private context via `enqueue_view_incognito` to assert timestamp or
/// block-number constraints without revealing the calling contract address.
///
/// The selectors are derived with `comptime { FunctionSelector::from_signature(...) }`,
/// which matches exactly what the `#[aztec]` macro generates for the real contract.
pub struct PublicChecksInterface {
    pub target_contract: AztecAddress,
}

impl PublicChecksInterface {
    pub fn at(target_contract: AztecAddress) -> Self {
        Self { target_contract }
    }

    pub fn check_timestamp(self, operation: u8, value: u64) -> PublicStaticCall<15, 2, ()> {
        let selector = comptime { FunctionSelector::from_signature("check_timestamp(u8,u64)") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "check_timestamp",
            [operation as Field, value as Field],
        )
    }

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
