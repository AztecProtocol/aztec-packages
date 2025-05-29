use crate::{
    address::AztecAddress,
    constants::{
        MAX_ENQUEUED_CALLS_PER_TX, NUM_PUBLIC_CALL_REQUEST_ARRAYS, PUBLIC_CALL_REQUEST_LENGTH,
    },
    traits::{Deserialize, Empty, FromField, is_empty, Serialize, ToField},
    utils::{arrays::array_length, reader::Reader},
};

pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,
    pub is_static_call: bool,
    pub calldata_hash: Field,
}

impl Eq for PublicCallRequest {
    fn eq(self, other: PublicCallRequest) -> bool {
        (self.msg_sender == other.msg_sender)
            & (self.contract_address == other.contract_address)
            & (self.is_static_call == other.is_static_call)
            & (self.calldata_hash == other.calldata_hash)
    }
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

impl Serialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
    fn serialize(self) -> [Field; PUBLIC_CALL_REQUEST_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_CALL_REQUEST_LENGTH> = BoundedVec::new();

        fields.push(self.msg_sender.to_field());
        fields.push(self.contract_address.to_field());
        fields.push(self.is_static_call as Field);
        fields.push(self.calldata_hash);

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
            is_static_call: reader.read_bool(),
            calldata_hash: reader.read(),
        };
        reader.finish();
        request
    }
}

pub struct PublicCallRequestArrayLengths {
    pub setup_calls: u32,
    pub app_logic_calls: u32,
    pub teardown_call: bool,
}

impl PublicCallRequestArrayLengths {
    pub fn new(
        setup_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
        app_logic_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
        teardown_call_request: PublicCallRequest,
    ) -> Self {
        PublicCallRequestArrayLengths {
            setup_calls: array_length(setup_call_requests),
            app_logic_calls: array_length(app_logic_call_requests),
            teardown_call: !is_empty(teardown_call_request),
        }
    }
}

impl Empty for PublicCallRequestArrayLengths {
    fn empty() -> Self {
        PublicCallRequestArrayLengths { setup_calls: 0, app_logic_calls: 0, teardown_call: false }
    }
}

impl Eq for PublicCallRequestArrayLengths {
    fn eq(self, other: PublicCallRequestArrayLengths) -> bool {
        (self.setup_calls == other.setup_calls)
            & (self.app_logic_calls == other.app_logic_calls)
            & (self.teardown_call == other.teardown_call)
    }
}

impl Serialize<NUM_PUBLIC_CALL_REQUEST_ARRAYS> for PublicCallRequestArrayLengths {
    fn serialize(self) -> [Field; NUM_PUBLIC_CALL_REQUEST_ARRAYS] {
        let mut fields: BoundedVec<Field, NUM_PUBLIC_CALL_REQUEST_ARRAYS> = BoundedVec::new();

        fields.push(self.setup_calls as Field);
        fields.push(self.app_logic_calls as Field);
        fields.push(self.teardown_call as Field);

        fields.storage()
    }
}

impl Deserialize<NUM_PUBLIC_CALL_REQUEST_ARRAYS> for PublicCallRequestArrayLengths {
    fn deserialize(
        fields: [Field; NUM_PUBLIC_CALL_REQUEST_ARRAYS],
    ) -> PublicCallRequestArrayLengths {
        let mut reader = Reader::new(fields);

        let item = PublicCallRequestArrayLengths {
            setup_calls: reader.read_u32(),
            app_logic_calls: reader.read_u32(),
            teardown_call: reader.read_bool(),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_public_call_request() {
    let item = PublicCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn serialization_of_empty_public_call_request_array_lengths() {
    let item = PublicCallRequestArrayLengths::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequestArrayLengths::deserialize(serialized);
    assert(item.eq(deserialized));
}
