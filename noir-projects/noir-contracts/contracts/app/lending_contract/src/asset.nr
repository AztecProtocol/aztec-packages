use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// Struct to be used to represent "totals". Generally, there should be one per Asset.
/// It stores the global values that are shared among all users, such as an accumulator
/// and last time it was updated.
/// In practice, it should also point to an oracle and have more fields related to
/// loan to value ratios and other things, but we did not have enough reads/writes for this.
///
/// Note: Right now we are wasting so many writes. If changing last_updated_ts we will end
/// up rewriting all the values.
#[derive(Deserialize, Packable, Serialize)]
pub struct Asset {
    interest_accumulator: u128,
    last_updated_ts: u64,
    loan_to_value: u128,
    oracle: AztecAddress,
}
