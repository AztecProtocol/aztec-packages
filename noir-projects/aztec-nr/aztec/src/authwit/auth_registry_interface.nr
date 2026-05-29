use crate::context::calls::{PublicCall, PublicStaticCall};
use crate::protocol::{abis::function_selector::FunctionSelector, address::AztecAddress, traits::ToField};

/// Hand-written interface stub for the `AuthRegistry` canonical contract.
///
/// The `AuthRegistry` contract records public authentication witnesses
/// (`set_authorized`, `set_reject_all`) and atomically consumes them at
/// the consumer (`consume`). Consumer code in aztec-nr's `authwit::public`
/// module calls into the registry via this interface.
///
/// The selectors are derived with `comptime { FunctionSelector::from_signature(...) }`,
/// which matches exactly what the `#[aztec]` macro generates for the real contract.
pub struct AuthRegistryInterface {
    pub target_contract: AztecAddress,
}

impl AuthRegistryInterface {
    pub fn at(target_contract: AztecAddress) -> Self {
        Self { target_contract }
    }

    pub fn _set_authorized(
        self,
        approver: AztecAddress,
        message_hash: Field,
        authorize: bool,
    ) -> PublicCall<15, 3, ()> {
        let selector = comptime { FunctionSelector::from_signature("_set_authorized((Field),Field,bool)") };
        PublicCall::new(
            self.target_contract,
            selector,
            "_set_authorized",
            [approver.to_field(), message_hash, authorize as Field],
        )
    }

    pub fn consume(self, on_behalf_of: AztecAddress, inner_hash: Field) -> PublicCall<7, 2, Field> {
        let selector = comptime { FunctionSelector::from_signature("consume((Field),Field)") };
        PublicCall::new(
            self.target_contract,
            selector,
            "consume",
            [on_behalf_of.to_field(), inner_hash],
        )
    }

    pub fn is_consumable(self, on_behalf_of: AztecAddress, message_hash: Field) -> PublicStaticCall<13, 2, bool> {
        let selector = comptime { FunctionSelector::from_signature("is_consumable((Field),Field)") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "is_consumable",
            [on_behalf_of.to_field(), message_hash],
        )
    }

    pub fn is_reject_all(self, on_behalf_of: AztecAddress) -> PublicStaticCall<13, 1, bool> {
        let selector = comptime { FunctionSelector::from_signature("is_reject_all((Field))") };
        PublicStaticCall::new(
            self.target_contract,
            selector,
            "is_reject_all",
            [on_behalf_of.to_field()],
        )
    }

    pub fn set_authorized(self, message_hash: Field, authorize: bool) -> PublicCall<14, 2, ()> {
        let selector = comptime { FunctionSelector::from_signature("set_authorized(Field,bool)") };
        PublicCall::new(
            self.target_contract,
            selector,
            "set_authorized",
            [message_hash, authorize as Field],
        )
    }

    pub fn set_reject_all(self, reject: bool) -> PublicCall<14, 1, ()> {
        let selector = comptime { FunctionSelector::from_signature("set_reject_all(bool)") };
        PublicCall::new(
            self.target_contract,
            selector,
            "set_reject_all",
            [reject as Field],
        )
    }
}
