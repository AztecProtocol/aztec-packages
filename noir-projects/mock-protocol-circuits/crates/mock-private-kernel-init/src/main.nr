use dep::mock_types::{
    AppPublicInputs, PrivateKernelPublicInputs, PrivateKernelPublicInputsBuilder, TxRequest,
};

fn main(
    tx: TxRequest,
    app_inputs: call_data(1) AppPublicInputs,
) -> return_data PrivateKernelPublicInputs {
    let mut private_kernel_inputs = PrivateKernelPublicInputsBuilder::from_tx(tx);
    private_kernel_inputs.ingest_app_inputs(app_inputs);
    private_kernel_inputs.finish()
}

