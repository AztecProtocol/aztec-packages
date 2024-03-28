use crate::{
    abis::function_selector::FunctionSelector, address::{EthAddress, AztecAddress},
    constants::{CALL_CONTEXT_LENGTH, GENERATOR_INDEX__CALL_CONTEXT}, hash::pedersen_hash,
    traits::{Deserialize, Hash, Serialize, is_default}, abis::side_effect::Ordered
};
use dep::std::default::Default;

// docs:start:call-context
struct CallContext {
    msg_sender : AztecAddress,
    storage_contract_address : AztecAddress,
    portal_contract_address : EthAddress,

    function_selector : FunctionSelector,

    is_delegate_call : bool,
    is_static_call : bool,

    side_effect_counter : u32,
}
// docs:end:call-context

impl Default for CallContext {
    fn default() -> Self {
        CallContext {
            msg_sender: AztecAddress::default(),
            storage_contract_address: AztecAddress::default(),
            portal_contract_address: EthAddress::default(),
            function_selector: FunctionSelector::default(),
            is_delegate_call: false,
            is_static_call: false,
            side_effect_counter: 0,
        }
    }
}

impl Eq for CallContext {
    fn eq(self, other: CallContext) -> bool {
        self.serialize() == other.serialize()
    }
}

impl Hash for CallContext {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__CALL_CONTEXT)
    }
}

impl Serialize<CALL_CONTEXT_LENGTH> for CallContext {
    fn serialize(self) -> [Field; CALL_CONTEXT_LENGTH] {
        [
            self.msg_sender.to_field(),
            self.storage_contract_address.to_field(),
            self.portal_contract_address.to_field(),
            self.function_selector.to_field(),
            self.is_delegate_call as Field,
            self.is_static_call as Field,
            self.side_effect_counter as Field,
        ]
    }
}

impl Deserialize<CALL_CONTEXT_LENGTH> for CallContext {
    fn deserialize(serialized: [Field; CALL_CONTEXT_LENGTH]) -> CallContext {
        CallContext {
            msg_sender: AztecAddress::from_field(serialized[0]),
            storage_contract_address: AztecAddress::from_field(serialized[1]),
            portal_contract_address: EthAddress::from_field(serialized[2]),
            function_selector: FunctionSelector::from_field(serialized[3]),
            is_delegate_call: serialized[4] as bool,
            is_static_call: serialized[5] as bool,
            side_effect_counter: serialized[6] as u32,
        }
    }
}

#[test]
fn serialize_deserialize_of_empty() {
    let context = CallContext::default();
    let serialized = context.serialize();
    let deserialized = CallContext::deserialize(serialized);
    assert(context.eq(deserialized));
}

#[test]
fn test_is_default() {
    let context = CallContext::default();
    assert(is_default(context), true);
}

#[test(should_fail)]
fn test_not_default() {
    let mut context = CallContext::default();
    context.is_delegate_call = true;
    assert(is_default(context), true);
}

#[test]
fn test_eq() {
    let mut context1 = CallContext::default();
    let mut context2 = CallContext::default();

    context1.is_delegate_call = true;
    context2.is_delegate_call = true;

    let address: AztecAddress = AztecAddress::from_field(69420);
    context1.msg_sender = address;
    context2.msg_sender = address;

    assert(context1.eq(context2));
}

#[test(should_fail)]
fn not_eq_test_eq() {
    let mut context1 = CallContext::default();
    let mut context2 = CallContext::default();

    context1.is_delegate_call = true;
    context2.is_delegate_call = false;

    let address1: AztecAddress = AztecAddress::from_field(69420);
    let address2: AztecAddress = AztecAddress::from_field(42069);

    context1.msg_sender = address1;
    context2.msg_sender = address2;

    assert(context1.eq(context2));
}

#[test]
fn hash_smoke() {
    let context = CallContext::default();
    let _hashed = context.hash();
}
