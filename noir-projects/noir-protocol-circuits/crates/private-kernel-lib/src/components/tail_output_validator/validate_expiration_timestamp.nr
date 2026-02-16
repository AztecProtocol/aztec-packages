use types::{abis::global_variables::GlobalVariables, constants::MAX_TX_LIFETIME};

/// We enforce in the tail circuit that the `include_by_timestamp` is at most MAX_TX_LIFETIME after the
/// tx's anchor timestamp. This restriction was motivated by wanting to prune network nodes'
/// mempools of all txs that are longer than a day old.
pub fn validate_expiration_timestamp(expiration_timestamp: u64, global_variables: GlobalVariables) {
    let max_timestamp = global_variables.timestamp + MAX_TX_LIFETIME;
    assert(expiration_timestamp <= max_timestamp, "expiration_timestamp exceeds max tx lifetime");
}
