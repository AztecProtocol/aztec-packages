use crate::{
    abis::{
    accumulated_data::PublicAccumulatedData, combined_constant_data::CombinedConstantData, gas::Gas,
    public_call_request::PublicCallRequest, public_inner_call_request::PublicInnerCallRequest,
    validation_requests::PublicValidationRequests
},
    constants::{MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, VM_CIRCUIT_PUBLIC_INPUTS_LENGTH},
    traits::{Deserialize, Empty, Serialize}, utils::reader::Reader
};

struct VMCircuitPublicInputs {
    constants: CombinedConstantData,
    call_request: PublicCallRequest,

    // TODO(#7124): To be deprecated.
    public_call_stack: [PublicInnerCallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],

    validation_requests: PublicValidationRequests,
    accumulated_data: PublicAccumulatedData,
    start_gas_left: Gas,
    transaction_fee: Field,
    reverted: bool,
}

impl Empty for VMCircuitPublicInputs {
    fn empty() -> Self {
        VMCircuitPublicInputs {
            constants: CombinedConstantData::empty(),
            call_request: PublicCallRequest::empty(),
            public_call_stack: [PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
            validation_requests: PublicValidationRequests::empty(),
            accumulated_data: PublicAccumulatedData::empty(),
            start_gas_left: Gas::empty(),
            transaction_fee: 0,
            reverted: false
        }
    }
}

impl Eq for VMCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.constants == other.constants)
            & (self.call_request == other.call_request)
            & (self.public_call_stack == other.public_call_stack)
            & (self.validation_requests == other.validation_requests)
            & (self.accumulated_data == other.accumulated_data)
            & (self.start_gas_left == other.start_gas_left)
            & (self.transaction_fee == other.transaction_fee)
            & (self.reverted == other.reverted)
    }
}

impl Serialize<VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for VMCircuitPublicInputs {
    fn serialize(self) -> [Field; VM_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.constants.serialize());
        fields.extend_from_array(self.call_request.serialize());
        for i in 0..MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX {
            fields.extend_from_array(self.public_call_stack[i].serialize());
        }
        fields.extend_from_array(self.validation_requests.serialize());
        fields.extend_from_array(self.accumulated_data.serialize());
        fields.extend_from_array(self.start_gas_left.serialize());
        fields.push(self.transaction_fee);
        fields.push(self.reverted as Field);

        assert_eq(fields.len(), VM_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for VMCircuitPublicInputs {
    fn deserialize(fields: [Field; VM_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> VMCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = VMCircuitPublicInputs {
            constants: reader.read_struct(CombinedConstantData::deserialize),
            call_request: reader.read_struct(PublicCallRequest::deserialize),
            public_call_stack: reader.read_struct_array(
                PublicInnerCallRequest::deserialize,
                [PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX]
            ),
            validation_requests: reader.read_struct(PublicValidationRequests::deserialize),
            accumulated_data: reader.read_struct(PublicAccumulatedData::deserialize),
            start_gas_left: reader.read_struct(Gas::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool
        };
        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty() {
    let item = VMCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = VMCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
