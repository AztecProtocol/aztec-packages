use crate::abis::{kernel_circuit_public_inputs::vm_circuit_public_inputs::VMCircuitPublicInputs};

// Mocked here as the only remaining non-recursive proof
pub struct Proof {}

pub struct EnqueuedCallData {
    data: VMCircuitPublicInputs,
    proof: Proof,
}
