use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_honk_proof};
use types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;

// A private function as the private kernels see one: it puts `PrivateCircuitPublicInputs` on the
// return data bus, and it recursively verifies an UltraHonk ZK proof on the way. The public inputs
// arrive ready-made (the kernels only ever consume them as-is), so the verifier is all this circuit
// does.
fn main(
    public_inputs: PrivateCircuitPublicInputs,
    inner_verification_key: UltraHonkVerificationKey,
    inner_proof: UltraHonkZKProof,
    inner_public_inputs: [Field; 1],
    inner_key_hash: Field,
) -> return_data PrivateCircuitPublicInputs {
    verify_honk_proof(
        inner_verification_key,
        inner_proof,
        inner_public_inputs,
        inner_key_hash,
    );
    public_inputs
}
