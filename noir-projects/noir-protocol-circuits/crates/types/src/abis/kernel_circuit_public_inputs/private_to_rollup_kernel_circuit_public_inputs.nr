use crate::{
    abis::{
        accumulated_data::PrivateToRollupAccumulatedData, gas::Gas,
        tx_constant_data::TxConstantData,
    },
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__PRIVATE_TX_HASH, PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    },
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Eq)]
pub struct PrivateToRollupKernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub end: PrivateToRollupAccumulatedData,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress,
    pub include_by_timestamp: u64,
}

impl Empty for PrivateToRollupKernelCircuitPublicInputs {
    fn empty() -> Self {
        PrivateToRollupKernelCircuitPublicInputs {
            end: PrivateToRollupAccumulatedData::empty(),
            constants: TxConstantData::empty(),
            gas_used: Gas::empty(),
            fee_payer: AztecAddress::empty(),
            include_by_timestamp: 0,
        }
    }
}

impl Serialize<PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateToRollupKernelCircuitPublicInputs {
    fn serialize(self) -> [Field; PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH> =
            BoundedVec::new();

        fields.extend_from_array(self.constants.serialize());
        fields.extend_from_array(self.end.serialize());
        fields.extend_from_array(self.gas_used.serialize());
        fields.extend_from_array(self.fee_payer.serialize());
        fields.push(self.include_by_timestamp as Field);

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
            constants: reader.read_struct(TxConstantData::deserialize),
            end: reader.read_struct(PrivateToRollupAccumulatedData::deserialize),
            gas_used: reader.read_struct(Gas::deserialize),
            fee_payer: reader.read_struct(AztecAddress::deserialize),
            include_by_timestamp: reader.read_u64(),
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
