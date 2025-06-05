use types::abis::validation_requests::RollupValidationRequests;

// TODO #5345: why is block_number a Field and not u32?
pub fn validate_max_block_number(
    validation_requests: RollupValidationRequests,
    current_block_number: Field,
) {
    if validation_requests.max_block_number.is_some() {
        assert(
            current_block_number as u32 <= validation_requests.max_block_number.unwrap_unchecked(),
            "kernel max_block_number is smaller than block number",
        );
    }
}
