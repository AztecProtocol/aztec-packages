use types::{
    abis::validation_requests::KeyValidationRequestAndGenerator,
    side_effect::{Counted, Scoped},
};

/// Two read requests are considered duplicates if they read the same value from the same contract.
/// The counter (when the read happened) is irrelevant for dedup purposes.
pub fn are_duplicate_read_requests(a: Scoped<Counted<Field>>, b: Scoped<Counted<Field>>) -> bool {
    (a.inner.inner == b.inner.inner) & (a.contract_address == b.contract_address)
}

/// Two key validation requests are considered duplicates if they are exactly the same.
pub fn are_duplicate_key_validation_requests(
    a: Scoped<KeyValidationRequestAndGenerator>,
    b: Scoped<KeyValidationRequestAndGenerator>,
) -> bool {
    a == b
}
