use crate::abis::{
    accumulated_data::PublicAccumulatedData, combined_constant_data::CombinedConstantData,
    validation_requests::{RollupValidationRequests, ValidationRequests}, call_request::CallRequest
};
use crate::constants::MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX;

struct PublicKernelCircuitPublicInputs {
    validation_requests: ValidationRequests,
    end_non_revertible: PublicAccumulatedData,
    end: PublicAccumulatedData,
    constants: CombinedConstantData,
    revert_code: u8,
    public_teardown_call_stack: [CallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
}

impl PublicKernelCircuitPublicInputs {
    pub fn needs_setup(self) -> bool {
        // By definition, the final non-revertible enqueued call is for teardown.
        // since this is a stack, the teardown call would be the 0th element.
        // So if we have more than one element, we need setup.
        !self.end_non_revertible.public_call_stack[0].is_empty()
    }

    pub fn needs_app_logic(self) -> bool {
        // if we have any enqueued revertible public calls, we need to run the public app logic circuit.
        !self.end.public_call_stack[0].is_empty()
    }

    pub fn needs_teardown(self) -> bool {
        // By definition, the final non-revertible enqueued call is for teardown.
        // since this is a stack, the teardown call would be the 0th element.
        !self.public_teardown_call_stack[0].is_empty()
    }
}
