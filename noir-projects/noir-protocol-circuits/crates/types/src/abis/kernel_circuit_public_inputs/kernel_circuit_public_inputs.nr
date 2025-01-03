use crate::{
    abis::{
        accumulated_data::CombinedAccumulatedData, gas::Gas, tx_constant_data::TxConstantData,
        validation_requests::RollupValidationRequests,
    },
    address::AztecAddress,
    constants::KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct KernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub rollup_validation_requests: RollupValidationRequests,
    pub end: CombinedAccumulatedData,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress,
}

impl Empty for KernelCircuitPublicInputs {
    fn empty() -> Self {
        KernelCircuitPublicInputs {
            rollup_validation_requests: RollupValidationRequests::empty(),
            end: CombinedAccumulatedData::empty(),
            constants: TxConstantData::empty(),
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
            constants: reader.read_struct(TxConstantData::deserialize),
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
