use dep::mock_types::{AppPublicInputs, MAX_COMMITMENTS_PER_CALL};

fn main(commitments_to_create: [Field; MAX_COMMITMENTS_PER_CALL]) -> return_data AppPublicInputs {
    let mut result = AppPublicInputs::default();
    result.commitments = commitments_to_create;
    result
}

