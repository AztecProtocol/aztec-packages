use dep::types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator, traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

pub unconstrained fn get_propagated_key_validation_requests<let N: u32>(
    key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N>,
    key_validation_amount: u32,
) -> ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N> {
    let mut propagated: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, N> =
        ClaimedLengthArray::empty();

    // We'll process a number of requests up to the `key_validation_amount`. We'll propagate any beyond that.
    // We "shift" (from the front) items that we want to process, instead of "pop" (from the back),
    // to process the requests in the order in which they were made. It will also be easier to verify later.
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
