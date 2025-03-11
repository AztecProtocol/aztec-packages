use crate::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::PUBLIC_CALL_REQUEST_LENGTH,
    traits::{Deserialize, Empty, FromField, Serialize, ToField},
    utils::reader::Reader,
};

pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,

    // TODO: To be removed.
    // Function selector is the first world of calldata.
    pub function_selector: FunctionSelector,

    pub is_static_call: bool,
    pub args_hash: Field,
}

impl Eq for PublicCallRequest {
    fn eq(self, other: PublicCallRequest) -> bool {
        (self.msg_sender == other.msg_sender)
            & (self.contract_address == other.contract_address)
            & (self.function_selector == other.function_selector)
            & (self.is_static_call == other.is_static_call)
            & (self.args_hash == other.args_hash)
    }
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

impl Serialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
    fn serialize(self) -> [Field; PUBLIC_CALL_REQUEST_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_CALL_REQUEST_LENGTH> = BoundedVec::new();

        fields.push(self.msg_sender.to_field());
        fields.push(self.contract_address.to_field());
        fields.push(self.function_selector.to_field());
        fields.push(self.is_static_call as Field);
        fields.push(self.args_hash);

        assert_eq(fields.len(), PUBLIC_CALL_REQUEST_LENGTH);

        fields.storage()
    }
}

impl Deserialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
    fn deserialize(fields: [Field; PUBLIC_CALL_REQUEST_LENGTH]) -> PublicCallRequest {
        let mut reader = Reader::new(fields);

        let request = PublicCallRequest {
            msg_sender: AztecAddress::from_field(reader.read()),
            contract_address: AztecAddress::from_field(reader.read()),
            function_selector: FunctionSelector::from_field(reader.read()),
            is_static_call: reader.read() as bool,
            args_hash: reader.read(),
        };
        reader.finish();
        request
    }
}

#[test]
fn serialization_of_empty_public_call_request() {
    let item = PublicCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
