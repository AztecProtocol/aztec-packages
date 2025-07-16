use dep::types::{
    abis::global_variables::GlobalVariables, constants::MAX_INCLUDE_BY_TIMESTAMP_DURATION,
};

pub fn validate_include_by_timestamp_duration(
    include_by_timestamp: u64,
    global_variables: GlobalVariables,
) {
    let max_timestamp = global_variables.timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    assert(
        include_by_timestamp <= max_timestamp,
        "include_by_timestamp exceeds the maximum duration",
    );
}
