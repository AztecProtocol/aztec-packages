use crate::{
    abis::{
        accumulated_data::PublicAccumulatedDataBuilder,
        combined_constant_data::CombinedConstantData,
        kernel_circuit_public_inputs::public_kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
        public_call_request::PublicCallRequest,
        validation_requests::PublicValidationRequestsBuilder,
    },
    address::AztecAddress,
    traits::Empty,
};

pub struct PublicKernelCircuitPublicInputsBuilder {
    constants: CombinedConstantData,
    validation_requests: PublicValidationRequestsBuilder,
    end_non_revertible: PublicAccumulatedDataBuilder,
    end: PublicAccumulatedDataBuilder,
    end_side_effect_counter: u32,
    public_teardown_call_request: PublicCallRequest,
    fee_payer: AztecAddress,
    revert_code: u8,
}

impl PublicKernelCircuitPublicInputsBuilder {
    pub fn new(data: PublicKernelCircuitPublicInputs) -> Self {
        PublicKernelCircuitPublicInputsBuilder {
            constants: data.constants,
            validation_requests: PublicValidationRequestsBuilder::new(data.validation_requests),
            end_non_revertible: PublicAccumulatedDataBuilder::new(data.end_non_revertible),
            end: PublicAccumulatedDataBuilder::new(data.end),
            end_side_effect_counter: data.end_side_effect_counter,
            public_teardown_call_request: data.public_teardown_call_request,
            fee_payer: data.fee_payer,
            revert_code: data.revert_code,
        }
    }

    pub fn finish(self) -> PublicKernelCircuitPublicInputs {
        PublicKernelCircuitPublicInputs {
            constants: self.constants,
            // Note that we're including both the validation_requests AND the rollup_validation requests, because this
            // struct is used as an input for both the public kernel and base rollup circuits. In the near future the
            // base rollup will only receive rollup_validation_requests, and the public kernel only validation_requests.
            validation_requests: self.validation_requests.finish(),
            end_non_revertible: self.end_non_revertible.finish(),
            end: self.end.finish(),
            end_side_effect_counter: self.end_side_effect_counter,
            public_teardown_call_request: self.public_teardown_call_request,
            fee_payer: self.fee_payer,
            revert_code: self.revert_code,
        }
    }
}

impl Empty for PublicKernelCircuitPublicInputsBuilder {
    fn empty() -> Self {
        PublicKernelCircuitPublicInputsBuilder {
            constants: CombinedConstantData::empty(),
            validation_requests: PublicValidationRequestsBuilder::empty(),
            end_non_revertible: PublicAccumulatedDataBuilder::empty(),
            end: PublicAccumulatedDataBuilder::empty(),
            end_side_effect_counter: 0,
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            revert_code: 0 as u8,
        }
    }
}
