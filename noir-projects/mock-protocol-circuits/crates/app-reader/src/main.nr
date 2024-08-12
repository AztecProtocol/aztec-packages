use dep::mock_types::{AppPublicInputs, MAX_COMMITMENT_READ_REQUESTS_PER_CALL};

fn main(commitments_to_read: [Field; MAX_COMMITMENT_READ_REQUESTS_PER_CALL]) -> pub AppPublicInputs {
    let mut result = AppPublicInputs::default();
    result.read_requests = commitments_to_read;
    result
}

