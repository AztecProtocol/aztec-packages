use dep::mock_types::{TxRequest, PrivateKernelPublicInputs, PrivateKernelPublicInputsBuilder, AppPublicInputs};

fn main(
    tx: TxRequest,
    verification_key: [Field; 200],
    app_inputs: call_data(1) AppPublicInputs
) -> return_data PrivateKernelPublicInputs {
    std::verify_proof_with_type(verification_key, [], [], 0, 3725892389);

    let mut private_kernel_inputs = PrivateKernelPublicInputsBuilder::from_tx(tx);
    private_kernel_inputs.ingest_app_inputs(app_inputs);
    private_kernel_inputs.finish()
}

