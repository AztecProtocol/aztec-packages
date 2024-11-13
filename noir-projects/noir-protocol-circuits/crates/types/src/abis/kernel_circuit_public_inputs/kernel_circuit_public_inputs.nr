use crate::{
    abis::{
        accumulated_data::CombinedAccumulatedData, combined_constant_data::CombinedConstantData,
        gas::Gas, validation_requests::RollupValidationRequests,
    },
    address::AztecAddress,
    constants::KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    partial_state_reference::PartialStateReference,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

// TODO: Update it to be specifically for the private_kernel_tail once we remove public_kernel_tail, which also outputs this.
pub struct KernelCircuitPublicInputs {
    pub rollup_validation_requests: RollupValidationRequests,
    pub end: CombinedAccumulatedData,
    pub constants: CombinedConstantData,
    pub start_state: PartialStateReference,
    pub revert_code: u8,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress,
}

impl Empty for KernelCircuitPublicInputs {
    fn empty() -> Self {
        KernelCircuitPublicInputs {
            rollup_validation_requests: RollupValidationRequests::empty(),
            end: CombinedAccumulatedData::empty(),
            constants: CombinedConstantData::empty(),
            start_state: PartialStateReference::empty(),
            revert_code: 0,
            gas_used: Gas::empty(),
            fee_payer: AztecAddress::empty(),
        }
    }
}

impl Eq for KernelCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.rollup_validation_requests.eq(other.rollup_validation_requests))
            & (self.end.eq(other.end))
            & (self.constants.eq(other.constants))
            & (self.start_state.eq(other.start_state))
            & (self.revert_code == other.revert_code)
            & (self.gas_used == other.gas_used)
            & (self.fee_payer.eq(other.fee_payer))
    }
}

impl Serialize<KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for KernelCircuitPublicInputs {
    fn serialize(self) -> [Field; KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.rollup_validation_requests.serialize());
        fields.extend_from_array(self.end.serialize());
        fields.extend_from_array(self.constants.serialize());
        fields.extend_from_array(self.start_state.serialize());
        fields.push(self.revert_code as Field);
        fields.extend_from_array(self.gas_used.serialize());
        fields.extend_from_array(self.fee_payer.serialize());

        assert_eq(fields.len(), KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage()
    }
}

impl Deserialize<KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for KernelCircuitPublicInputs {
    fn deserialize(
        fields: [Field; KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH],
    ) -> KernelCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = Self {
            rollup_validation_requests: reader.read_struct(RollupValidationRequests::deserialize),
            end: reader.read_struct(CombinedAccumulatedData::deserialize),
            constants: reader.read_struct(CombinedConstantData::deserialize),
            start_state: reader.read_struct(PartialStateReference::deserialize),
            revert_code: reader.read() as u8,
            gas_used: reader.read_struct(Gas::deserialize),
            fee_payer: reader.read_struct(AztecAddress::deserialize),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_kernel_circuit_public_inputs() {
    let item = KernelCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = KernelCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
