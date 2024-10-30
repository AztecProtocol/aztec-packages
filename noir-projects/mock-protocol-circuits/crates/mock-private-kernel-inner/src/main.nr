use dep::mock_types::{AppPublicInputs, PrivateKernelPublicInputs, PrivateKernelPublicInputsBuilder};

fn main(
    prev_kernel_public_inputs: call_data(0) PrivateKernelPublicInputs,
    app_inputs: call_data(1) AppPublicInputs,
) -> return_data PrivateKernelPublicInputs {
    let mut private_kernel_inputs =
        PrivateKernelPublicInputsBuilder::from_previous_kernel(prev_kernel_public_inputs);
    private_kernel_inputs.ingest_app_inputs(app_inputs);
    private_kernel_inputs.finish()
}

