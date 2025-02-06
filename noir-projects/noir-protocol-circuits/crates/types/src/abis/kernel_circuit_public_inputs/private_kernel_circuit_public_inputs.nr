use crate::{
    abis::{
        accumulated_data::PrivateAccumulatedData, public_call_request::PublicCallRequest,
        tx_constant_data::TxConstantData, validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::array_length,
};
use std::meta::derive;

#[derive(Eq)]
pub struct PrivateKernelCircuitPublicInputsArrayLengths {
    pub note_hash_read_requests: u32,
    pub nullifier_read_requests: u32,
    pub scoped_key_validation_requests_and_generators: u32,
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub private_logs: u32,
    pub contract_class_logs_hashes: u32,
    pub public_call_requests: u32,
    pub private_call_stack: u32,
}

impl PrivateKernelCircuitPublicInputsArrayLengths {
    pub fn new(public_inputs: PrivateKernelCircuitPublicInputs) -> Self {
        PrivateKernelCircuitPublicInputsArrayLengths {
            note_hash_read_requests: array_length(
                public_inputs.validation_requests.note_hash_read_requests,
            ),
            nullifier_read_requests: array_length(
                public_inputs.validation_requests.nullifier_read_requests,
            ),
            scoped_key_validation_requests_and_generators: array_length(
                public_inputs.validation_requests.scoped_key_validation_requests_and_generators,
            ),
            note_hashes: array_length(public_inputs.end.note_hashes),
            nullifiers: array_length(public_inputs.end.nullifiers),
            l2_to_l1_msgs: array_length(public_inputs.end.l2_to_l1_msgs),
            private_logs: array_length(public_inputs.end.private_logs),
            contract_class_logs_hashes: array_length(public_inputs.end.contract_class_logs_hashes),
            public_call_requests: array_length(public_inputs.end.public_call_requests),
            private_call_stack: array_length(public_inputs.end.private_call_stack),
        }
    }

    pub fn empty() -> Self {
        PrivateKernelCircuitPublicInputsArrayLengths {
            note_hash_read_requests: 0,
            nullifier_read_requests: 0,
            scoped_key_validation_requests_and_generators: 0,
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            private_logs: 0,
            contract_class_logs_hashes: 0,
            public_call_requests: 0,
            private_call_stack: 0,
        }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateKernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub min_revertible_side_effect_counter: u32,
    pub validation_requests: PrivateValidationRequests,
    pub end: PrivateAccumulatedData,
    pub public_teardown_call_request: PublicCallRequest,
    pub fee_payer: AztecAddress,
    pub is_private_only: bool,
    pub claimed_first_nullifier: Field,
}

impl Empty for PrivateKernelCircuitPublicInputs {
    fn empty() -> Self {
        Self {
            constants: TxConstantData::empty(),
            min_revertible_side_effect_counter: 0,
            validation_requests: PrivateValidationRequests::empty(),
            end: PrivateAccumulatedData::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            is_private_only: false,
            claimed_first_nullifier: 0,
        }
    }
}

mod test {
    use crate::{
        abis::kernel_circuit_public_inputs::private_kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        constants::PRIVATE_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_kernel_circuit_public_inputs() {
        let item = PrivateKernelCircuitPublicInputs::empty();
        // We use the PRIVATE_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH] = item.serialize();
        let deserialized = PrivateKernelCircuitPublicInputs::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
