use crate::abis::public_circuit_public_inputs::PublicCircuitPublicInputs;

// Mocked here as the only remaining non-recursive proof
pub struct Proof {}

// TODO(#7124): To be deprecated.
pub struct PublicCallData {
    public_inputs: PublicCircuitPublicInputs,
    proof: Proof,
    bytecode_hash: Field,
}
