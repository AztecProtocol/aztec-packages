use crate::{
    abis::{
        accumulated_data::PrivateToRollupAccumulatedData, gas::Gas,
        tx_constant_data::TxConstantData,
    },
    address::AztecAddress,
    constants::GENERATOR_INDEX__PRIVATE_TX_HASH,
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
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

impl Hash for PrivateToRollupKernelCircuitPublicInputs {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__PRIVATE_TX_HASH)
    }
}

mod test {
    use crate::{
        abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        constants::PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_to_rollup_kernel_circuit_public_inputs() {
        let item = PrivateToRollupKernelCircuitPublicInputs::empty();
        // We use the PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] =
            item.serialize();
        let deserialized = PrivateToRollupKernelCircuitPublicInputs::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
