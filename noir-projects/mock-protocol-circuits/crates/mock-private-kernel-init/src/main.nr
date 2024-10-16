use dep::mock_types::{
    TxRequest, PrivateKernelPublicInputs, PrivateKernelPublicInputsBuilder, AppPublicInputs,
    CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, PROOF_TYPE_OINK
};

fn main(
    tx: TxRequest,
    app_inputs: call_data(1) AppPublicInputs,
    app_vk: [Field; CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS]
) -> return_data PrivateKernelPublicInputs {
    std::verify_proof_with_type(app_vk, [], [], 0, PROOF_TYPE_OINK);

    let mut private_kernel_inputs = PrivateKernelPublicInputsBuilder::from_tx(tx);
    private_kernel_inputs.ingest_app_inputs(app_inputs);
    private_kernel_inputs.finish()
}

