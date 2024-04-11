// This file contains items which are mocked because 
// they need the proof system.

struct AggregationObject{}

impl Empty for AggregationObject {
    fn empty() -> Self {
        AggregationObject {}
    }
}

struct Proof{}

impl Empty for Proof {
    fn empty() -> Self {
        Proof {}
    }
}

struct VerificationKey{}

impl Empty for VerificationKey {
    fn empty() -> Self {
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
