use crate::{
    abis::{
        accumulated_data::PublicAccumulatedData, combined_constant_data::CombinedConstantData,
        public_call_request::PublicCallRequest, validation_requests::PublicValidationRequests,
    },
    address::AztecAddress,
    constants::PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct PublicKernelCircuitPublicInputs {
    constants: CombinedConstantData,
    validation_requests: PublicValidationRequests,
    end_non_revertible: PublicAccumulatedData,
    end: PublicAccumulatedData,
    end_side_effect_counter: u32,
    public_teardown_call_request: PublicCallRequest,
    fee_payer: AztecAddress,
    revert_code: u8,
}

impl Empty for PublicKernelCircuitPublicInputs {
    fn empty() -> Self {
        PublicKernelCircuitPublicInputs {
            constants: CombinedConstantData::empty(),
            validation_requests: PublicValidationRequests::empty(),
            end_non_revertible: PublicAccumulatedData::empty(),
            end: PublicAccumulatedData::empty(),
            end_side_effect_counter: 0,
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            revert_code: 0,
        }
    }
}

impl Serialize<PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PublicKernelCircuitPublicInputs {
    fn serialize(self) -> [Field; PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> =
            BoundedVec::new();

        fields.extend_from_array(self.constants.serialize());
        fields.extend_from_array(self.validation_requests.serialize());
        fields.extend_from_array(self.end_non_revertible.serialize());
        fields.extend_from_array(self.end.serialize());
        fields.push(self.end_side_effect_counter as Field);
        fields.extend_from_array(self.public_teardown_call_request.serialize());
        fields.extend_from_array(self.fee_payer.serialize());
        fields.push(self.revert_code as Field);

        assert_eq(fields.len(), PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PublicKernelCircuitPublicInputs {
    fn deserialize(
        fields: [Field; PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH],
    ) -> PublicKernelCircuitPublicInputs {
        let mut reader = Reader::new(fields);

        let item = PublicKernelCircuitPublicInputs {
            constants: reader.read_struct(CombinedConstantData::deserialize),
            validation_requests: reader.read_struct(PublicValidationRequests::deserialize),
            end_non_revertible: reader.read_struct(PublicAccumulatedData::deserialize),
            end: reader.read_struct(PublicAccumulatedData::deserialize),
            end_side_effect_counter: reader.read_u32(),
            public_teardown_call_request: reader.read_struct(PublicCallRequest::deserialize),
            fee_payer: reader.read_struct(AztecAddress::deserialize),
            revert_code: reader.read() as u8,
        };
        reader.finish();
        item
    }
}

impl Eq for PublicKernelCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.constants == other.constants)
            & (self.validation_requests == other.validation_requests)
            & (self.end_non_revertible == other.end_non_revertible)
            & (self.end == other.end)
            & (self.end_side_effect_counter == other.end_side_effect_counter)
            & (self.public_teardown_call_request == other.public_teardown_call_request)
            & (self.fee_payer == other.fee_payer)
            & (self.revert_code == other.revert_code)
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicKernelCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = PublicKernelCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
