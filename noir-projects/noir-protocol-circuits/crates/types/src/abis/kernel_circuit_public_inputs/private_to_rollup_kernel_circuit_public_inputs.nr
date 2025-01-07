use crate::{
    abis::{
        accumulated_data::PrivateToRollupAccumulatedData, gas::Gas,
        tx_constant_data::TxConstantData, validation_requests::RollupValidationRequests,
    },
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__PRIVATE_TX_HASH, PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    },
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
    utils::reader::Reader,
};

pub struct PrivateToRollupKernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub rollup_validation_requests: RollupValidationRequests,
    pub end: PrivateToRollupAccumulatedData,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress,
}

impl Empty for PrivateToRollupKernelCircuitPublicInputs {
    fn empty() -> Self {
        PrivateToRollupKernelCircuitPublicInputs {
            rollup_validation_requests: RollupValidationRequests::empty(),
            end: PrivateToRollupAccumulatedData::empty(),
            constants: TxConstantData::empty(),
            gas_used: Gas::empty(),
            fee_payer: AztecAddress::empty(),
        }
    }
}

impl Eq for PrivateToRollupKernelCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.rollup_validation_requests.eq(other.rollup_validation_requests))
            & (self.end.eq(other.end))
            & (self.constants.eq(other.constants))
            & (self.gas_used == other.gas_used)
            & (self.fee_payer.eq(other.fee_payer))
    }
}

impl Serialize<PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateToRollupKernelCircuitPublicInputs {
    fn serialize(self) -> [Field; PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> =
            BoundedVec::new();

        fields.extend_from_array(self.rollup_validation_requests.serialize());
        fields.extend_from_array(self.end.serialize());
        fields.extend_from_array(self.constants.serialize());
        fields.extend_from_array(self.gas_used.serialize());
        fields.extend_from_array(self.fee_payer.serialize());

        assert_eq(fields.len(), PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage()
    }
}

impl Hash for PrivateToRollupKernelCircuitPublicInputs {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__PRIVATE_TX_HASH)
    }
}

impl Deserialize<PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateToRollupKernelCircuitPublicInputs {
    fn deserialize(
        fields: [Field; PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH],
    ) -> PrivateToRollupKernelCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = Self {
            rollup_validation_requests: reader.read_struct(RollupValidationRequests::deserialize),
            end: reader.read_struct(PrivateToRollupAccumulatedData::deserialize),
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
    let item = PrivateToRollupKernelCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = PrivateToRollupKernelCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
