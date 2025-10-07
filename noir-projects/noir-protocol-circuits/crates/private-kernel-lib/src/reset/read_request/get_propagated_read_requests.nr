use super::read_request_action::{ReadRequestAction, ReadRequestActions};
use dep::types::{
    abis::read_request::ScopedReadRequest, traits::Empty, utils::arrays::ClaimedLengthArray,
};

pub unconstrained fn get_propagated_read_requests<let ReadRequestLen: u32>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, ReadRequestLen>,
    read_request_actions: [ReadRequestAction; ReadRequestLen],
) -> ClaimedLengthArray<ScopedReadRequest, ReadRequestLen> {
    let mut propagated_read_requests = ClaimedLengthArray::empty();
    for i in 0..read_requests.length {
        let read_request = read_requests.array[i];

        // Q: Why don't we just pop a subarray of read_requests off the pile, and process those?
        // A: Unlike key validation request, we can't always process the first N read requests,
        // because some of them might be reading a pending note hash that's not included yet.
        if read_request_actions[i].action == ReadRequestActions.SKIP {
            propagated_read_requests.push(read_request);
        }
    }

    // If not all read requests are propagated, we must still copy the first item beyond the claimed length into the
    // propagated array to prevent incorrect equality assertions in `validate_propagated_read_requests`.
    // See the implementation of `validate_propagated_read_requests` for more details.
    if read_requests.length != ReadRequestLen {
        let num_propagated = propagated_read_requests.length;
        propagated_read_requests.array[num_propagated] = read_requests.array[read_requests.length];
    }

    propagated_read_requests
}
