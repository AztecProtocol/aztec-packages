use types::abis::validation_requests::RollupValidationRequests;

pub fn validate_include_by_timestamp(
    validation_requests: RollupValidationRequests,
    current_timestamp: u64,
) {
    // We don't validate the include_by_timestamp when proving at genesis because the timestamp is not populated in
    // the genesis block header and hence this would not work with contract updates. Skipping the check at genesis
    // block is fine because there are no updatable contracts we could be interacting with when proving against
    // a genesis block.
    let proving_at_genesis = current_timestamp == 0;

    if validation_requests.include_by_timestamp.is_some() & !proving_at_genesis {
        assert(
            current_timestamp <= validation_requests.include_by_timestamp.unwrap_unchecked(),
            "kernel include_by_timestamp is smaller than timestamp",
        );
    }
}
