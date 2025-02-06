use crate::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

// docs:start:call-context
#[derive(Deserialize, Eq, Serialize)]
pub struct CallContext {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,
    pub function_selector: FunctionSelector,
    pub is_static_call: bool,
}
// docs:end:call-context

impl Empty for CallContext {
    fn empty() -> Self {
        CallContext {
            msg_sender: AztecAddress::empty(),
            contract_address: AztecAddress::empty(),
            function_selector: FunctionSelector::empty(),
            is_static_call: false,
        }
    }
}

mod test {
    use crate::{
        abis::call_context::CallContext,
        address::AztecAddress,
        constants::CALL_CONTEXT_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialize_deserialize_of_empty() {
        let context = CallContext::empty();
        // We use the CALL_CONTEXT_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; CALL_CONTEXT_LENGTH] = context.serialize();
        let deserialized = CallContext::deserialize(serialized);
        assert(context.eq(deserialized));
    }

    #[test]
    fn test_eq() {
        let mut context1 = CallContext::empty();
        let mut context2 = CallContext::empty();

        let address: AztecAddress = AztecAddress::from_field(69420);
        context1.msg_sender = address;
        context2.msg_sender = address;

        assert(context1.eq(context2));
    }

    #[test(should_fail)]
    fn not_eq_test_eq() {
        let mut context1 = CallContext::empty();
        let mut context2 = CallContext::empty();

        let address1: AztecAddress = AztecAddress::from_field(69420);
        let address2: AztecAddress = AztecAddress::from_field(42069);

        context1.msg_sender = address1;
        context2.msg_sender = address2;

        assert(context1.eq(context2));
    }
}
