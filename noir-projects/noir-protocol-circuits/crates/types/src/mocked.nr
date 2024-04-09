// This file contains items which are mocked because 
// they need the proof system.

struct AggregationObject{}

impl Default for AggregationObject {
    fn default() -> Self {
        AggregationObject {}
    }
}

struct Proof{}

impl Default for Proof {
    fn default() -> Self {
        Proof {}
    }
}

struct VerificationKey{}

impl Default for VerificationKey {
    fn default() -> Self {
        VerificationKey {}
    }
}

// Perform recursive verification of the previous kernel proof and private call
// proof.
pub fn verify_previous_kernel_state(
    _aggregation_object: AggregationObject,
    _proof: Proof
) -> (bool, AggregationObject) {
    (true, AggregationObject {})
}
