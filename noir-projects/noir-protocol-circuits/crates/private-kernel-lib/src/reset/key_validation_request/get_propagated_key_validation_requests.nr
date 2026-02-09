use ::types::{
    abis::validation_requests::KeyValidationRequestAndGenerator, side_effect::Scoped, traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// Creates the set of key validation requests which won't be processed by this Reset circuit (due
/// to lack of capacity), but will be propagated to the next kernel circuit for a future Reset
/// circuit to process.
pub unconstrained fn get_propagated_key_validation_requests<let N: u32>(
    key_validation_requests: ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, N>,
    key_validation_amount: u32,
) -> ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, N> {
    let mut propagated = ClaimedLengthArray::empty();

    // Up to `key_validation_amount` requests will be validated, and the remaining ones will be propagated.
    // For efficiency, we "shift" (remove from the front) the requests to validate, rather than "pop" (from the back).
    // This simplifies index management when validating the propagated requests.
    // See `KeyValidationRequestsValidator` for more details.
    //
    // The loop below copies all requests with index >= `key_validation_amount` into the `propagated` array, effectively
    // producing the set of un-validated requests to be passed to the next circuit.
    for i in key_validation_amount..key_validation_requests.length {
        propagated.array[i - key_validation_amount] = key_validation_requests.array[i];
    }

    propagated.length = if key_validation_requests.length > key_validation_amount {
        key_validation_requests.length - key_validation_amount
    } else {
        0
    };

    propagated
}
