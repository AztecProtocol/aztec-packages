use dep::mock_types::{
    AppPublicInputs, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, PrivateKernelPublicInputs,
    PrivateKernelPublicInputsBuilder, PROOF_TYPE_PG, VerificationKey,
};

fn main(
    prev_kernel_public_inputs: call_data(0) PrivateKernelPublicInputs,
    kernel_vk: VerificationKey<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
    app_inputs: call_data(1) AppPublicInputs,
    app_vk: VerificationKey<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
) -> return_data PrivateKernelPublicInputs {
    std::verify_proof_with_type(kernel_vk.key, [], [], kernel_vk.hash, PROOF_TYPE_PG);
    std::verify_proof_with_type(app_vk.key, [], [], app_vk.hash, PROOF_TYPE_PG);

    let mut private_kernel_inputs =
        PrivateKernelPublicInputsBuilder::from_previous_kernel(prev_kernel_public_inputs);
    private_kernel_inputs.ingest_app_inputs(app_inputs);
    private_kernel_inputs.finish()
}
