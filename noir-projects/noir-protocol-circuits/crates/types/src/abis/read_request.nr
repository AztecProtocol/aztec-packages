use crate::{
    abis::side_effect::{Ordered, Scoped},
    address::AztecAddress,
    constants::{READ_REQUEST_LENGTH, SCOPED_READ_REQUEST_LEN},
    traits::{Deserialize, Empty, Serialize, ToField},
    utils::{arrays::array_concat, reader::Reader},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct ReadRequest {
    pub value: Field,
    pub counter: u32,
}

impl Ordered for ReadRequest {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Empty for ReadRequest {
    fn empty() -> Self {
        ReadRequest { value: 0, counter: 0 }
    }
}

impl ReadRequest {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedReadRequest {
        ScopedReadRequest { read_request: self, contract_address }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedReadRequest {
    pub read_request: ReadRequest,
    pub contract_address: AztecAddress,
}

impl Scoped<ReadRequest> for ScopedReadRequest {
    fn inner(self) -> ReadRequest {
        self.read_request
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Empty for ScopedReadRequest {
    fn empty() -> Self {
        ScopedReadRequest {
            read_request: ReadRequest::empty(),
            contract_address: AztecAddress::empty(),
        }
    }
}

impl ScopedReadRequest {
    pub fn value(self) -> Field {
        self.read_request.value
    }
    pub fn counter(self) -> u32 {
        self.read_request.counter
    }
}

mod test {
    use crate::{
        abis::read_request::{ReadRequest, ScopedReadRequest},
        constants::{READ_REQUEST_LENGTH, SCOPED_READ_REQUEST_LEN},
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_read_request() {
        let item = ReadRequest::empty();
        // We use the READ_REQUEST_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; READ_REQUEST_LENGTH] = item.serialize();
        let deserialized = ReadRequest::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn serialization_of_empty_scoped_read_request() {
        let item = ScopedReadRequest::empty();
        // We use the SCOPED_READ_REQUEST_LEN constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; SCOPED_READ_REQUEST_LEN] = item.serialize();
        let deserialized = ScopedReadRequest::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
