use types::abis::{global_variables::GlobalVariables, validation_requests::RollupValidationRequests};

pub fn validate_include_by_timestamp(
    validation_requests: RollupValidationRequests,
    global_variables_of_block_being_built: GlobalVariables,
) {
    // We don't validate the include_by_timestamp when building block 1 because the timestamp is not populated in
    // the genesis block header and hence this would not work with contract updates. Skipping the check at block 1
    // is fine because there are no updatable contracts we could be interacting with when proving against a genesis
    // block.
    let building_block_1 = global_variables_of_block_being_built.block_number == 1;

    if validation_requests.include_by_timestamp.is_some() & !building_block_1 {
        assert(
            global_variables_of_block_being_built.timestamp
                <= validation_requests.include_by_timestamp.unwrap_unchecked(),
            "kernel include_by_timestamp is smaller than timestamp",
        );
    }
}
