use crate::{
    abis::{
        function_data::FunctionData,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
    },
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__CALL_STACK_ITEM,
        PRIVATE_CALL_STACK_ITEM_LENGTH,
    },
    hash::pedersen_hash,
    traits::{
        Deserialize,
        Hash,
        Serialize,
    },
    utils::reader::Reader,
};

struct PrivateCallStackItem {
    // This is the _actual_ contract address relating to where this function's code resides in the
    // contract tree. Regardless of whether this is a call or delegatecall, this
    // `contract_address` _does not change_. Amongst other things, it's used as a lookup for
    // getting the correct code from the tree. There is a separate `storage_contract_address`
    // within a CallStackItem which varies depending on whether this is a call or delegatecall.
    contract_address: AztecAddress,
    function_data: FunctionData,
    public_inputs: PrivateCircuitPublicInputs,
    // Not really needed for PrivateCallStackItem.
    is_execution_request: bool,
}

impl Serialize<PRIVATE_CALL_STACK_ITEM_LENGTH> for PrivateCallStackItem {
    fn serialize(self) -> [Field; PRIVATE_CALL_STACK_ITEM_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_CALL_STACK_ITEM_LENGTH> = BoundedVec::new(0); 

        fields.push(self.contract_address.to_field());
        fields.extend_from_array(self.function_data.serialize());
        fields.extend_from_array(self.public_inputs.serialize());
        fields.push(self.is_execution_request as Field);

        assert_eq(fields.len(), PRIVATE_CALL_STACK_ITEM_LENGTH);

        fields.storage
    }
}

impl Deserialize<PRIVATE_CALL_STACK_ITEM_LENGTH> for PrivateCallStackItem {
    fn deserialize(serialized: [Field; PRIVATE_CALL_STACK_ITEM_LENGTH]) -> Self {
        // TODO(#4390): This should accept a reader ^ to avoid copying data.
        let mut reader = Reader::new(serialized);

        let item = Self {
            contract_address: reader.read_struct(AztecAddress::deserialize),
            function_data: reader.read_struct(FunctionData::deserialize),
            public_inputs: reader.read_struct(PrivateCircuitPublicInputs::deserialize),
            is_execution_request: reader.read() as bool,
        };

        reader.finish();
        item
    }
}

impl Hash for PrivateCallStackItem {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__CALL_STACK_ITEM)
    }
}

#[test]
fn serialization_smoke() {
    let item: PrivateCallStackItem = dep::std::unsafe::zeroed();
    let _serialized = item.serialize();
}

#[test]
fn hash_smoke() {
    let item: PrivateCallStackItem = dep::std::unsafe::zeroed();
    let _hashed = item.hash();
}
