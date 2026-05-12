// GENERATED FILE - DO NOT EDIT
//
// Written by `yarn-project/canonical-contracts/src/scripts/generate_interfaces.ts` from the compiled
// `PublicChecks` artifact. Regenerate with
// `yarn workspace @aztec/canonical-contracts run regen:canonical-interfaces`.
//
// The selectors below are derived via `comptime { FunctionSelector::from_signature(...) }` at
// Noir compile time, with the signature string emitted from the artifact's parameter list. This
// keeps the wrapper in lockstep with whatever the `#[aztec]` macro generates for the real
// contract; any drift between the contract's external signatures and this file fails the
// `generate_interfaces.test.ts` freshness gate.

use crate::context::calls::PublicStaticCall;
use crate::protocol::{abis::function_selector::FunctionSelector, address::AztecAddress};

pub struct PublicChecksInterface {
    pub target_contract: AztecAddress,
}

impl PublicChecksInterface {
    pub fn at(target_contract: AztecAddress) -> Self {
        Self { target_contract }
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

    pub fn check_timestamp(self, operation: u8, value: u64) -> PublicStaticCall<15, 2, ()> {
        let selector = comptime { FunctionSelector::from_signature("check_timestamp(u8,u64)") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "check_timestamp",
            [operation as Field, value as Field],
        )
    }
}
