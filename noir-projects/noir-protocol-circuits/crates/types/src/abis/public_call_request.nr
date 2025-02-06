use crate::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,

    // TODO: To be removed.
    // Function selector is the first world of calldata.
    pub function_selector: FunctionSelector,

    pub is_static_call: bool,
    pub args_hash: Field,
}

impl Empty for PublicCallRequest {
    fn empty() -> Self {
        PublicCallRequest {
            msg_sender: AztecAddress::empty(),
            contract_address: AztecAddress::empty(),
            function_selector: FunctionSelector::empty(),
            is_static_call: false,
            args_hash: 0,
        }
    }
}

mod test {
    use crate::{
        abis::{function_selector::FunctionSelector, public_call_request::PublicCallRequest},
        address::AztecAddress,
        constants::PUBLIC_CALL_REQUEST_LENGTH,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_public_call_request() {
        let item = PublicCallRequest {
            msg_sender: AztecAddress::from_field(1),
            contract_address: AztecAddress::from_field(2),
            function_selector: FunctionSelector::from_field(3),
            is_static_call: true,
            args_hash: 4,
        };
        // We use the PUBLIC_CALL_REQUEST_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; PUBLIC_CALL_REQUEST_LENGTH] = item.serialize();
        let deserialized = PublicCallRequest::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
