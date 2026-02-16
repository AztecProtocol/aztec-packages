use types::{abis::global_variables::GlobalVariables, constants::MAX_TX_LIFETIME};

pub fn validate_expiration_timestamp(expiration_timestamp: u64, global_variables: GlobalVariables) {
    let max_timestamp = global_variables.timestamp + MAX_TX_LIFETIME;
    assert(expiration_timestamp <= max_timestamp, "expiration_timestamp exceeds max tx lifetime");
}
