use types::{
    abis::private_call_request::PrivateCallRequest, side_effect::Ordered,
    utils::arrays::ClaimedLengthArray,
};

/// Validate that the counters of the `items` within the claimed length are strictly increasing and fall within the
/// specified range (`counter_start`, `counter_end`) (not inclusive).
pub fn validate_incrementing_counters_within_range<T, let N: u32>(
    counter_start: u32,
    counter_end: u32,
    items: ClaimedLengthArray<T, N>,
)
where
    T: Ordered,
{
    let mut prev_counter = counter_start;
    let mut should_check = true;
    for i in 0..N {
        should_check &= i != items.length;
        if should_check {
            let item = items.array[i];
            assert(
                item.counter() > prev_counter,
                "counter must be larger than the counter of the previous item",
            );
            prev_counter = item.counter();
        }
    }
    assert(prev_counter < counter_end, "counter must be smaller than the end counter of the call");
}

/// Validate that the `start_side_effect_counter` and `end_side_effect_counter` of the `private_call_requests` are
/// strictly increasing within the range (`counter_start`, `counter_end`) and non-overlapping - the
/// `start_side_effect_counter` of a call request must be larger than the `end_side_effect_counter` of the previous
/// call request.
pub fn validate_incrementing_call_request_counters_within_range<let N: u32>(
    counter_start: u32,
    counter_end: u32,
    private_call_requests: ClaimedLengthArray<PrivateCallRequest, N>,
) {
    let mut prev_counter = counter_start;
    let mut should_check = true;
    for i in 0..N {
        should_check &= i != private_call_requests.length;
        if should_check {
            let item = private_call_requests.array[i];
            assert(
                item.start_side_effect_counter > prev_counter,
                "start counter must be larger than the end counter of the previous call",
            );
            assert(
                item.end_side_effect_counter > item.start_side_effect_counter,
                "nested call has incorrect counter range",
            );
            prev_counter = item.end_side_effect_counter;
        }
    }
    assert(
        prev_counter < counter_end,
        "end counter must be smaller than the end counter of the parent call",
    );
}
