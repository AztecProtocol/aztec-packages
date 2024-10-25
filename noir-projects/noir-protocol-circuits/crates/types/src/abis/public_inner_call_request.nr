use crate::{
    abis::{public_call_stack_item_compressed::PublicCallStackItemCompressed, side_effect::Ordered},
    constants::PUBLIC_INNER_CALL_REQUEST_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

// TODO(#7124): To be deprecated.
pub struct PublicInnerCallRequest {
    item: PublicCallStackItemCompressed,
    counter: u32,
}

impl Ordered for PublicInnerCallRequest {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for PublicInnerCallRequest {
    fn eq(self, other: PublicInnerCallRequest) -> bool {
        (other.item == self.item) & (other.counter == self.counter)
    }
}

impl Empty for PublicInnerCallRequest {
    fn empty() -> Self {
        PublicInnerCallRequest { item: PublicCallStackItemCompressed::empty(), counter: 0 }
    }
}

impl Serialize<PUBLIC_INNER_CALL_REQUEST_LENGTH> for PublicInnerCallRequest {
    fn serialize(self) -> [Field; PUBLIC_INNER_CALL_REQUEST_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_INNER_CALL_REQUEST_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.item.serialize());
        fields.push(self.counter as Field);

        assert_eq(fields.len(), PUBLIC_INNER_CALL_REQUEST_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_INNER_CALL_REQUEST_LENGTH> for PublicInnerCallRequest {
    fn deserialize(fields: [Field; PUBLIC_INNER_CALL_REQUEST_LENGTH]) -> PublicInnerCallRequest {
        let mut reader = Reader::new(fields);

        let request = PublicInnerCallRequest {
            item: reader.read_struct(PublicCallStackItemCompressed::deserialize),
            counter: reader.read_u32(),
        };
        reader.finish();
        request
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicInnerCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicInnerCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
