use crate::{
    abis::{call_context::CallContext, side_effect::Ordered},
    address::AztecAddress,
    constants::PUBLIC_CALL_REQUEST_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct PublicCallRequest {
    call_context: CallContext,
    args_hash: Field,
    counter: u32,
}

impl Ordered for PublicCallRequest {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for PublicCallRequest {
    fn eq(self, other: PublicCallRequest) -> bool {
        (self.call_context == other.call_context)
            & (self.args_hash == other.args_hash)
            & (self.counter == other.counter)
    }
}

impl Empty for PublicCallRequest {
    fn empty() -> Self {
        PublicCallRequest { call_context: CallContext::empty(), args_hash: 0, counter: 0 }
    }
}

impl PublicCallRequest {
    pub fn expose_to_public(self) -> Self {
        PublicCallRequest { call_context: self.call_context, args_hash: self.args_hash, counter: 0 }
    }
}

impl Serialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
    fn serialize(self) -> [Field; PUBLIC_CALL_REQUEST_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_CALL_REQUEST_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.call_context.serialize());
        fields.push(self.args_hash);
        fields.push(self.counter as Field);

        assert_eq(fields.len(), PUBLIC_CALL_REQUEST_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
    fn deserialize(fields: [Field; PUBLIC_CALL_REQUEST_LENGTH]) -> PublicCallRequest {
        let mut reader = Reader::new(fields);

        let request = PublicCallRequest {
            call_context: reader.read_struct(CallContext::deserialize),
            args_hash: reader.read(),
            counter: reader.read_u32(),
        };
        reader.finish();
        request
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
