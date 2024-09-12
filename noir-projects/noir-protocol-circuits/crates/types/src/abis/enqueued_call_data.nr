use crate::abis::{kernel_circuit_public_inputs::vm_circuit_public_inputs::VMCircuitPublicInputs};

// Mocked here as the only remaining non-recursive proof
struct Proof {}

struct EnqueuedCallData {
    data: VMCircuitPublicInputs,
    proof: Proof,
}
