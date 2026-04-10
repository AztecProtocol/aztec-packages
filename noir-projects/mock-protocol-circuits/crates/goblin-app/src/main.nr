use mock_types::{AppPublicInputs, MAX_COMMITMENTS_PER_CALL, PROOF_TYPE_ULTRA_GOBLIN};

// Mock Goblin app
fn main(commitments_to_create: [Field; MAX_COMMITMENTS_PER_CALL]) -> return_data AppPublicInputs {
    std::verify_proof_with_type([], [], [], 0, PROOF_TYPE_ULTRA_GOBLIN);

    let mut result = AppPublicInputs::default();
    result.commitments = commitments_to_create;
    result
}
