use crate::{address::AztecAddress, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,
    pub is_static_call: bool,
    pub calldata_hash: Field,
}

impl Empty for PublicCallRequest {
    fn empty() -> Self {
        PublicCallRequest {
            msg_sender: AztecAddress::empty(),
            contract_address: AztecAddress::empty(),
            is_static_call: false,
            calldata_hash: 0,
        }
    }
}

#[test]
fn serialization_of_empty_public_call_request() {
    let item = PublicCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
