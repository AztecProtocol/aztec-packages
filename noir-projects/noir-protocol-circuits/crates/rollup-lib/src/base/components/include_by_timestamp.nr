use types::abis::global_variables::GlobalVariables;

pub fn validate_include_by_timestamp(
    include_by_timestamp: u64,
    global_variables_of_block_being_built: GlobalVariables,
) {
    // We don't validate the include_by_timestamp when building block 1 because the timestamp is not populated in
    // the genesis block header and hence this would not work with contract updates. Skipping the check at block 1
    // is fine because there are no updatable contracts we could be interacting with when proving against a genesis
    // block.
    let building_block_1 = global_variables_of_block_being_built.block_number == 1;
    let block_timestamp = global_variables_of_block_being_built.timestamp;
    if !building_block_1 {
        assert(
            include_by_timestamp >= block_timestamp,
            "tx include_by_timestamp is smaller than block timestamp",
        );
    }
}
