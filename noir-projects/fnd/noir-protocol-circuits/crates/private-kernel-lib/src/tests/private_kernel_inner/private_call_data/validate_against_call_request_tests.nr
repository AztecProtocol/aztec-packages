use crate::{
    private_kernel_inner::{self, PrivateKernelInnerCircuitPrivateInputs},
    tests::private_kernel_inner::TestBuilder,
};
use types::abis::private_call_request::PrivateCallRequest;

impl TestBuilder {
    pub fn new_call_request() -> (Self, PrivateCallRequest) {
        let builder = TestBuilder::new();
        let request = builder.private_call.to_private_call_request();
        (builder, request)
    }

    pub fn execute_with_call_request_and_fail(self, call_request: PrivateCallRequest) {
        let private_call = self.private_call.to_private_call_data();

        let mut previous_kernel_builder = self.previous_kernel;
        previous_kernel_builder.private_call_requests.push(call_request);
        let previous_kernel = previous_kernel_builder.to_private_kernel_data();

        let private_inputs =
            PrivateKernelInnerCircuitPrivateInputs { previous_kernel, private_call };

        let _ = private_kernel_inner::execute(private_inputs);
    }
}

#[test(should_fail_with = "call_context does not match call request")]
fn mismatch_call_context_contract_address() {
    let (builder, mut request) = TestBuilder::new_call_request();

    // Tweak the contract_address to be a different value.
    request.call_context.contract_address.inner += 1;

    builder.execute_with_call_request_and_fail(request);
}

#[test(should_fail_with = "args_hash does not match call request")]
fn mismatch_args_hash() {
    let (builder, mut request) = TestBuilder::new_call_request();

    // Tweak the args_hash to be a different value.
    request.args_hash += 1;

    builder.execute_with_call_request_and_fail(request);
}

#[test(should_fail_with = "returns_hash does not match call request")]
fn mismatch_returns_hash() {
    let (builder, mut request) = TestBuilder::new_call_request();

    // Tweak the returns_hash to be a different value.
    request.returns_hash += 1;

    builder.execute_with_call_request_and_fail(request);
}

#[test(should_fail_with = "start_side_effect_counter does not match call request")]
fn mismatch_start_side_effect_counter() {
    let (builder, mut request) = TestBuilder::new_call_request();

    // Tweak the start_side_effect_counter to be a different value.
    request.start_side_effect_counter += 1;

    builder.execute_with_call_request_and_fail(request);
}

#[test(should_fail_with = "end_side_effect_counter does not match call request")]
fn mismatch_end_side_effect_counter() {
    let (builder, mut request) = TestBuilder::new_call_request();

    // Tweak the end_side_effect_counter to be a different value.
    request.end_side_effect_counter += 1;

    builder.execute_with_call_request_and_fail(request);
}
