use crate::abis::{call_context::CallContext, function_data::FunctionData};
use crate::address::AztecAddress;
use crate::constants::{GENERATOR_INDEX__CALL_STACK_ITEM, PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH};
use crate::traits::{Hash, Empty, Serialize, Deserialize};
use crate::utils::reader::Reader;

struct PublicCallStackItemCompressed {
    contract_address: AztecAddress,
    call_context: CallContext,
    function_data: FunctionData,
    args_hash: Field,
}

impl Eq for PublicCallStackItemCompressed {
    fn eq(self, other: PublicCallStackItemCompressed) -> bool {
        (self.contract_address == other.contract_address)
            & (self.call_context == other.call_context)
            & (self.function_data == other.function_data)
            & (self.args_hash == other.args_hash)
    }
}

impl Hash for PublicCallStackItemCompressed {
    fn hash(self) -> Field {
        let item = self;
        std::hash::pedersen_hash_with_separator([
            item.contract_address.to_field(),
            item.call_context.hash(),
            item.function_data.hash(),
            item.args_hash,
        ], GENERATOR_INDEX__CALL_STACK_ITEM)
    }
}

impl Empty for PublicCallStackItemCompressed {

    fn empty() -> Self {
        PublicCallStackItemCompressed {
            contract_address: AztecAddress::empty(),
            call_context: CallContext::empty(),
            function_data: FunctionData::empty(),
            args_hash: 0,
        }
    }
}

impl Serialize<PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH> for PublicCallStackItemCompressed {
    fn serialize(self) -> [Field; PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH> = BoundedVec::new();

        fields.push(self.contract_address.to_field());
        fields.extend_from_array(self.call_context.serialize());
        fields.extend_from_array(self.function_data.serialize());
        fields.push(self.args_hash);

        assert_eq(fields.len(), PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH> for PublicCallStackItemCompressed {
  fn deserialize(fields: [Field; PUBLIC_CALL_STACK_ITEM_COMPRESSED_LENGTH]) -> PublicCallStackItemCompressed {
    let mut reader = Reader::new(fields);

    let item = PublicCallStackItemCompressed {
      contract_address: reader.read_struct(AztecAddress::deserialize),
      call_context: reader.read_struct(CallContext::deserialize),
      function_data: reader.read_struct(FunctionData::deserialize),
      args_hash: reader.read(),
    };
    reader.finish();
    item
  }
}
