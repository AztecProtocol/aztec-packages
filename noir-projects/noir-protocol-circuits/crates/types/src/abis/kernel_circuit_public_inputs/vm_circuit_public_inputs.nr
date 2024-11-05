use crate::{
    abis::{
        accumulated_data::{PublicAccumulatedData, PublicAccumulatedDataArrayLengths},
        combined_constant_data::CombinedConstantData,
        gas::Gas,
        public_call_request::PublicCallRequest,
        public_inner_call_request::PublicInnerCallRequest,
        validation_requests::{PublicValidationRequestArrayLengths, PublicValidationRequests},
    },
    constants::{MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, VM_CIRCUIT_PUBLIC_INPUTS_LENGTH},
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct VMCircuitPublicInputs {
    constants: CombinedConstantData,
    call_request: PublicCallRequest,

    // TODO(#7124): To be deprecated.
    public_call_stack: [PublicInnerCallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],

    previous_validation_request_array_lengths: PublicValidationRequestArrayLengths, // Lengths of the validation requests before the enqueued call.
    validation_requests: PublicValidationRequests, // Validation requests emitted throughout the enqueued call.
    previous_accumulated_data_array_lengths: PublicAccumulatedDataArrayLengths, // Lengths of the accumulated data before the enqueued call.
    accumulated_data: PublicAccumulatedData, // Data emitted throughout the enqueued call.
    start_side_effect_counter: u32,
    end_side_effect_counter: u32,
    start_gas_left: Gas,
    transaction_fee: Field,
    reverted: bool,
}

impl Empty for VMCircuitPublicInputs {
    fn empty() -> Self {
        VMCircuitPublicInputs {
            constants: CombinedConstantData::empty(),
            call_request: PublicCallRequest::empty(),
            public_call_stack: [
                PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX
            ],
            previous_validation_request_array_lengths: PublicValidationRequestArrayLengths::empty(),
            validation_requests: PublicValidationRequests::empty(),
            previous_accumulated_data_array_lengths: PublicAccumulatedDataArrayLengths::empty(),
            accumulated_data: PublicAccumulatedData::empty(),
            start_side_effect_counter: 0,
            end_side_effect_counter: 0,
            start_gas_left: Gas::empty(),
            transaction_fee: 0,
            reverted: false,
        }
    }
}

impl Eq for VMCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.constants == other.constants)
            & (self.call_request == other.call_request)
            & (self.public_call_stack == other.public_call_stack)
            & (
                self.previous_validation_request_array_lengths
                    == other.previous_validation_request_array_lengths
            )
            & (self.validation_requests == other.validation_requests)
            & (
                self.previous_accumulated_data_array_lengths
                    == other.previous_accumulated_data_array_lengths
            )
            & (self.accumulated_data == other.accumulated_data)
            & (self.start_side_effect_counter == other.start_side_effect_counter)
            & (self.end_side_effect_counter == other.end_side_effect_counter)
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
        fields.extend_from_array(self.previous_validation_request_array_lengths.serialize());
        fields.extend_from_array(self.validation_requests.serialize());
        fields.extend_from_array(self.previous_accumulated_data_array_lengths.serialize());
        fields.extend_from_array(self.accumulated_data.serialize());
        fields.push(self.start_side_effect_counter as Field);
        fields.push(self.end_side_effect_counter as Field);
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
                [PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
            ),
            previous_validation_request_array_lengths: reader.read_struct(
                PublicValidationRequestArrayLengths::deserialize,
            ),
            validation_requests: reader.read_struct(PublicValidationRequests::deserialize),
            previous_accumulated_data_array_lengths: reader.read_struct(
                PublicAccumulatedDataArrayLengths::deserialize,
            ),
            accumulated_data: reader.read_struct(PublicAccumulatedData::deserialize),
            start_side_effect_counter: reader.read_u32(),
            end_side_effect_counter: reader.read_u32(),
            start_gas_left: reader.read_struct(Gas::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool,
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
