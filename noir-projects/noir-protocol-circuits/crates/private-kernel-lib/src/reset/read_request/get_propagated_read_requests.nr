use super::read_request_action::{ReadRequestAction, ReadRequestActions};
use ::types::{side_effect::{Counted, Scoped}, traits::Empty, utils::arrays::ClaimedLengthArray};

/// According to the hints provided, this fn splice-removes all read requests that are to be processed
/// by this reset circuit, and outputs a list of the remaining read_requests that are to
/// be "skipped" by this circuit and propagated to some later instance of the reset circuit instead.
pub unconstrained fn get_propagated_read_requests<let ReadRequestLen: u32>(
    read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    read_request_actions_hints: [ReadRequestAction; ReadRequestLen],
) -> ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen> {
    let mut propagated_read_requests = ClaimedLengthArray::empty();
    for i in 0..read_requests.length {
        let read_request = read_requests.array[i];

        // Q: Why don't we just pop a subarray of read_requests off the pile, and process those?
        // A: Unlike key validation requests, we can't always process the first N read requests
        // of the array, because some of them might be reading a pending note_hash that's not been
        // "seen" by any kernel circuit yet: the app circuit which emits the note_hash might be
        // processed by a later kernel iteration in this tx, and so the note_hash isn't in the
        // previous_kernel's array of note_hashes yet.
        if read_request_actions_hints[i].action == ReadRequestActions.SKIP {
            propagated_read_requests.push(read_request);
        }
    }

    propagated_read_requests
}
