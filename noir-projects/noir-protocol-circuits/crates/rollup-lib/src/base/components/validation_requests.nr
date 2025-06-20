use types::abis::validation_requests::RollupValidationRequests;

pub fn validate_include_by_timestamp(
    validation_requests: RollupValidationRequests,
    current_timestamp: u64,
) {
    if validation_requests.include_by_timestamp.is_some() {
        assert(
            current_timestamp <= validation_requests.include_by_timestamp.unwrap_unchecked(),
            "kernel include_by_timestamp is smaller than timestamp",
        );
    }
}
