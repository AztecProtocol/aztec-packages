use crate::{
    abis::{
        accumulated_data::PrivateAccumulatedDataBuilder,
        kernel_circuit_public_inputs::private_kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        public_call_request::PublicCallRequest, tx_constant_data::TxConstantData,
        validation_requests::PrivateValidationRequestsBuilder,
    },
    address::AztecAddress,
    traits::Empty,
};

pub struct PrivateKernelCircuitPublicInputsBuilder {
    constants: TxConstantData,
    min_revertible_side_effect_counter: u32,
    validation_requests: PrivateValidationRequestsBuilder,
    end: PrivateAccumulatedDataBuilder,
    public_teardown_call_request: PublicCallRequest,
    fee_payer: AztecAddress,
    is_private_only: bool,
}

impl PrivateKernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> PrivateKernelCircuitPublicInputs {
        PrivateKernelCircuitPublicInputs {
            constants: self.constants,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            validation_requests: self.validation_requests.finish(),
            end: self.end.finish(),
            public_teardown_call_request: self.public_teardown_call_request,
            fee_payer: self.fee_payer,
            is_private_only: self.is_private_only,
        }
    }
}

impl Empty for PrivateKernelCircuitPublicInputsBuilder {
    fn empty() -> Self {
        PrivateKernelCircuitPublicInputsBuilder {
            constants: TxConstantData::empty(),
            min_revertible_side_effect_counter: 0,
            validation_requests: PrivateValidationRequestsBuilder::empty(),
            end: PrivateAccumulatedDataBuilder::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            is_private_only: false,
        }
    }
}
