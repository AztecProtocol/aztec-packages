use crate::abis::public_circuit_public_inputs::PublicCircuitPublicInputs;

// Mocked here as the only remaining non-recursive proof
pub struct Proof {}

// TODO(#7124): To be deprecated.
pub struct PublicCallData {
    pub public_inputs: PublicCircuitPublicInputs,
    pub proof: Proof,
    pub bytecode_hash: Field,
}
