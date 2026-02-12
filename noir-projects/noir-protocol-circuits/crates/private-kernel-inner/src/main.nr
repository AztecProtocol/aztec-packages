use private_kernel_lib::{private_kernel_inner, PrivateKernelInnerCircuitPrivateInputs};
use types::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
    },
    PrivateKernelCircuitPublicInputs,
};

/*
 * Notice: app_public_inputs are always passed-into kernels via call_data column 1.
 * The public_inputs of an app circuit are output via that circuit's `return_data` databus column. 
 * See `aztec-nr/aztec/src/macros/internals_functions_generation/external/private.nr` for usage of `return_data`.
 * Then, within this kernel circuit, that same data (the app circuit's public inputs) is passed-in via `call_data(1)`.
 * Behind the scenes, barretenberg matches the app proof's `return_data` commitment with this kernel circuit's `call_data(1)` commitment.
 * Similarly, the previous kernel's public inputs are always returned from that circuit as `return_data` and passed-into
 * the next kernel via `call_data(0)`.
 * Behind the scenes, barretenberg matches the previous kernel proof's `return_data` commitment with this kernel circuit's 
 * `call_data(0)` commitment (see `chonk.cpp` and `chonk_verifier.cpp`).
 */
fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs, // Separated from the previous kernel public inputs, because those are passed-in via databus call_data(0). Recombined within the circuit.
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallDataWithoutPublicInputs, // Separated from the app public inputs, because those are passed-in via databus call_data(1). Recombined within the circuit.
    app_public_inputs: call_data(1) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInnerCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        private_call: private_call.to_private_call_data(app_public_inputs),
    };
    private_kernel_inner::execute(private_inputs)
}
