use crate::abis::{function_data::FunctionData, public_circuit_public_inputs::PublicCircuitPublicInputs};
use crate::address::AztecAddress;
use crate::constants::{GENERATOR_INDEX__CALL_STACK_ITEM, PUBLIC_CALL_STACK_ITEM_LENGTH};
use crate::traits::{Hash, Serialize, Deserialize};
use crate::utils::reader::Reader;

struct PublicCallStackItem {
    contract_address: AztecAddress,
    function_data: FunctionData,
    public_inputs: PublicCircuitPublicInputs,
    // True if this call stack item represents a request to execute a function rather than a
    // fulfilled execution. Used when enqueuing calls from private to public functions.
    is_execution_request: bool,
}

impl Hash for PublicCallStackItem {
    fn hash(self) -> Field {
        let item = if self.is_execution_request {
            self.as_execution_request()
        } else {
            self
        };

        dep::std::hash::pedersen_hash_with_separator([
            item.contract_address.to_field(),
            item.function_data.hash(),
            item.public_inputs.hash(),
        ], GENERATOR_INDEX__CALL_STACK_ITEM)
    }
}

impl PublicCallStackItem {
    fn as_execution_request(self) -> Self {
        let public_inputs = self.public_inputs;
        let mut request_public_inputs: PublicCircuitPublicInputs = dep::std::unsafe::zeroed();
        request_public_inputs.call_context = public_inputs.call_context;
        request_public_inputs.args_hash = public_inputs.args_hash;

        let call_stack_item = PublicCallStackItem {
            contract_address: self.contract_address,
            function_data: self.function_data,
            is_execution_request: true,
            public_inputs: request_public_inputs
        };
        call_stack_item
    }
}

impl Serialize<PUBLIC_CALL_STACK_ITEM_LENGTH> for PublicCallStackItem {
    fn serialize(self) -> [Field; PUBLIC_CALL_STACK_ITEM_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_CALL_STACK_ITEM_LENGTH> = BoundedVec::new();

        fields.push(self.contract_address.to_field());
        fields.extend_from_array(self.function_data.serialize());
        fields.extend_from_array(self.public_inputs.serialize());
        fields.push(self.is_execution_request as Field);

        assert_eq(fields.len(), PUBLIC_CALL_STACK_ITEM_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_CALL_STACK_ITEM_LENGTH> for PublicCallStackItem {
    fn deserialize(serialized: [Field; PUBLIC_CALL_STACK_ITEM_LENGTH]) -> Self {
        let mut reader = Reader::new(serialized);
        let item = Self {
            contract_address: reader.read_struct(AztecAddress::deserialize),
            function_data: reader.read_struct(FunctionData::deserialize),
            public_inputs: reader.read_struct(PublicCircuitPublicInputs::deserialize),
            is_execution_request: reader.read() as bool,
        };

        item
    }
}

impl Eq for PublicCallStackItem {
    fn eq(self, other: Self) -> bool {
        self.contract_address.eq(other.contract_address) &
        self.function_data.eq(other.function_data) &
        self.public_inputs.eq(other.public_inputs) &
        self.is_execution_request.eq(other.is_execution_request)
    }
}

mod tests {
    use crate::{
        abis::{
        function_data::FunctionData, function_selector::FunctionSelector,
        public_circuit_public_inputs::PublicCircuitPublicInputs,
        public_call_stack_item::PublicCallStackItem, side_effect::SideEffect
    },
        address::AztecAddress, constants::GENERATOR_INDEX__CALL_STACK_ITEM, traits::Hash
    };

    #[test]
    fn serialize_smoke() {
        let item: PublicCallStackItem = dep::std::unsafe::zeroed();
        let serialized = item.serialize();
        let deserialized = PublicCallStackItem::deserialize(serialized);
        assert(item.eq(deserialized));
    }

    #[test]
    fn serialize_exec_request_smoke() {
        let mut item: PublicCallStackItem = dep::std::unsafe::zeroed();
        item.is_execution_request = true;
        let serialized = item.serialize();
        let deserialized = PublicCallStackItem::deserialize(serialized);
        assert(item.eq(deserialized));
    }

    #[test]
    fn compute_call_stack_item_request_hash() {
        let contract_address = AztecAddress::from_field(1);
        let function_data = FunctionData { selector: FunctionSelector::from_u32(2), is_private: false };

        let mut public_inputs: PublicCircuitPublicInputs = dep::std::unsafe::zeroed();
        public_inputs.new_note_hashes[0] = SideEffect{
            value: 1,
            counter: 0,
        };

        let call_stack_item = PublicCallStackItem { contract_address, public_inputs, is_execution_request: true, function_data };

        // Value from public_call_stack_item.test.ts "Computes a callstack item request hash" test
        let test_data_call_stack_item_request_hash = 0x0a408fba24eff0b40c9a7d4cb2ff1a8f651fbd7eeaeedc3488b6d2fcfede33e0;
        assert_eq(call_stack_item.hash(), test_data_call_stack_item_request_hash);
    }

    #[test]
    fn compute_call_stack_item_hash() {
        let contract_address = AztecAddress::from_field(1);
        let function_data = FunctionData { selector: FunctionSelector::from_u32(2), is_private: false };

        let mut public_inputs: PublicCircuitPublicInputs = dep::std::unsafe::zeroed();
        public_inputs.new_note_hashes[0] = SideEffect{
            value: 1,
            counter: 0,
        };

        let call_stack_item = PublicCallStackItem { contract_address, public_inputs, is_execution_request: false, function_data };

        // Value from public_call_stack_item.test.ts "Computes a callstack item hash" test
        let test_data_call_stack_item_hash = 0x2cd2eb79283cc7c9b22ccfafd6a200f153e8114e3f7d6adf527bfa76db59d26b;
        assert_eq(call_stack_item.hash(), test_data_call_stack_item_hash);
    }
}
