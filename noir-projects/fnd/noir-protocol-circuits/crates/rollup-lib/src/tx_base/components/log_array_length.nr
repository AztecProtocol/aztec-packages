use types::{
    abis::{log_hash::LogHash, private_log::PrivateLog},
    side_effect::Scoped,
    utils::arrays::array_length_until,
};

// The logic in this file relies on the property that log arrays are "dense-trimmed": all logs with non-zero length
// appear first, followed by logs with zero length (used as padding).
// This structure is enforced by the Tail-to-Public kernel circuit and remains intact even after array concatenation in
// the public_tx_effect_builder. As a result, we can safely use the index of the first zero-length log to determine the
// logical length of the logs array.
//
// @dev: Unlike other smaller arrays (note hashes, nullifiers, and l2-to-l1 messages) that use `array_length`, it is
// more efficient for log arrays to use `array_length_until` and iterate through all lengths (u32).
// `array_length_until` is also more efficient than an optimized version of `array_length` that would call the
// unconstrained `find_first_index` and then validate the result by checking just the lengths of two adjacent elements
// (rather than verifying whether the entire log is empty).

/// Returns the number of private logs with length > 0.
pub fn get_private_log_array_length<let N: u32>(array: [PrivateLog; N]) -> u32 {
    array_length_until(array, |log| log.length == 0)
}

/// Returns the number of contract class log hashes with length > 0.
pub fn get_contract_class_log_hash_array_length<let N: u32>(array: [Scoped<LogHash>; N]) -> u32 {
    array_length_until(array, |log| log.inner.length == 0)
}
