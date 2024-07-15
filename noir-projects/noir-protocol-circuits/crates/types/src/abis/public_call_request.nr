use crate::{
    abis::{caller_context::CallerContext, side_effect::Ordered}, address::AztecAddress,
    constants::PUBLIC_CALL_REQUEST_LENGTH, traits::{Empty, Serialize, Deserialize},
    utils::reader::Reader
};

struct PublicCallRequest {
    hash: Field, // Move the content of item.get_compressed() here.
    caller_contract_address: AztecAddress,
    caller_context: CallerContext,
    counter: u32,
}

impl Ordered for PublicCallRequest {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for PublicCallRequest {
    fn eq(self, other: PublicCallRequest) -> bool {
        (other.hash == self.hash)
            & (other.caller_contract_address == self.caller_contract_address)
            & (other.caller_context == self.caller_context)
            & (other.counter == self.counter)
    }
}

impl Empty for PublicCallRequest {
    fn empty() -> Self {
        PublicCallRequest {
            hash: 0,
            caller_contract_address: AztecAddress::zero(),
            caller_context: CallerContext::empty(),
            counter: 0,
        }
    }
}

impl PublicCallRequest {
    pub fn expose_to_public(self) -> Self {
        PublicCallRequest {
            hash: self.hash,
            caller_contract_address: self.caller_contract_address,
            caller_context: self.caller_context,
            counter: 0
        }
    }
}

impl Serialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
  fn serialize(self) -> [Field; PUBLIC_CALL_REQUEST_LENGTH] {
    let mut fields: BoundedVec<Field, PUBLIC_CALL_REQUEST_LENGTH> = BoundedVec::new();

    fields.push(self.hash);
    fields.push(self.caller_contract_address.to_field());
    fields.extend_from_array(self.caller_context.serialize());
    fields.push(self.counter as Field);

    assert_eq(fields.len(), PUBLIC_CALL_REQUEST_LENGTH);

    fields.storage
  }
}

impl Deserialize<PUBLIC_CALL_REQUEST_LENGTH> for PublicCallRequest {
  fn deserialize(fields: [Field; PUBLIC_CALL_REQUEST_LENGTH]) -> PublicCallRequest {
    let mut reader = Reader::new(fields);

    let item = PublicCallRequest {
      hash: reader.read(),
      caller_contract_address: reader.read_struct(AztecAddress::deserialize),
      caller_context: reader.read_struct(CallerContext::deserialize),
      counter: reader.read_u32(),
    };
    reader.finish();
    item
  }
}

#[test]
fn serialization_of_empty() {
    let item = PublicCallRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicCallRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
