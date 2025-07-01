use crate::{
    abis::{
        accumulated_data::PrivateToPublicAccumulatedData, gas::Gas,
        public_call_request::PublicCallRequest, tx_constant_data::TxConstantData,
        validation_requests::RollupValidationRequests,
    },
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__PUBLIC_TX_HASH, PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    },
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToPublicKernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub rollup_validation_requests: RollupValidationRequests,
    pub non_revertible_accumulated_data: PrivateToPublicAccumulatedData,
    pub revertible_accumulated_data: PrivateToPublicAccumulatedData,
    pub public_teardown_call_request: PublicCallRequest,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress,
}

impl Empty for PrivateToPublicKernelCircuitPublicInputs {
    fn empty() -> Self {
        PrivateToPublicKernelCircuitPublicInputs {
            constants: TxConstantData::empty(),
            rollup_validation_requests: RollupValidationRequests::empty(),
            non_revertible_accumulated_data: PrivateToPublicAccumulatedData::empty(),
            revertible_accumulated_data: PrivateToPublicAccumulatedData::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            gas_used: Gas::empty(),
            fee_payer: AztecAddress::empty(),
        }
    }
}

impl Hash for PrivateToPublicKernelCircuitPublicInputs {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__PUBLIC_TX_HASH)
    }
}

mod test {
    use crate::{
        abis::kernel_circuit_public_inputs::private_to_public_kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
        constants::PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_to_public_kernel_circuit_public_inputs() {
        let item = PrivateToPublicKernelCircuitPublicInputs::empty();
        // We use the PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] =
            item.serialize();
        let deserialized = PrivateToPublicKernelCircuitPublicInputs::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
