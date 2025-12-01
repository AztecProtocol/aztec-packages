use crate::{
    abis::{
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::{SideEffectCounterRange, SideEffectUniquenessHints},
    },
    constants::{
        GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
        GLOBAL_INDEX_NOTE_HASH_OFFSET, GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        GLOBAL_INDEX_NULLIFIER_OFFSET, GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET, GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET, TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
    },
    side_effect::Ordered,
    traits::Empty,
    utils::arrays::subarray,
};

fn build_side_effect_range<T>(item: T, global_index: u32) -> SideEffectCounterRange
where
    T: Ordered,
{
    SideEffectCounterRange {
        start: item.counter(),
        end: item.counter(),
        side_effect_global_index: global_index,
    }
}

fn build_side_effect_range_from_private_call_request(
    item: PrivateCallRequest,
    global_index: u32,
) -> SideEffectCounterRange {
    SideEffectCounterRange {
        start: item.start_side_effect_counter,
        end: item.end_side_effect_counter,
        side_effect_global_index: global_index,
    }
}

pub unconstrained fn build_uniqueness_hints(
    public_inputs: PrivateCircuitPublicInputs,
) -> SideEffectUniquenessHints {
    let mut side_effect_ranges = BoundedVec::new();

    for i in 0..public_inputs.note_hash_read_requests.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.note_hash_read_requests.array[i],
            i + GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.nullifier_read_requests.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.nullifier_read_requests.array[i],
            i + GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.note_hashes.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.note_hashes.array[i],
            i + GLOBAL_INDEX_NOTE_HASH_OFFSET,
        ));
    }

    for i in 0..public_inputs.nullifiers.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.nullifiers.array[i],
            i + GLOBAL_INDEX_NULLIFIER_OFFSET,
        ));
    }

    for i in 0..public_inputs.private_call_requests.length {
        side_effect_ranges.push(build_side_effect_range_from_private_call_request(
            public_inputs.private_call_requests.array[i],
            i + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.public_call_requests.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.public_call_requests.array[i],
            i + GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.l2_to_l1_msgs.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.l2_to_l1_msgs.array[i],
            i + GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
        ));
    }

    for i in 0..public_inputs.private_logs.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.private_logs.array[i],
            i + GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        ));
    }

    for i in 0..public_inputs.contract_class_logs_hashes.length {
        side_effect_ranges.push(build_side_effect_range(
            public_inputs.contract_class_logs_hashes.array[i],
            i + GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        ));
    }

    let sorted_side_effect_ranges = side_effect_ranges.storage().sort_via(|a, b| {
        if b.is_empty() {
            true
        } else {
            a.start <= b.start
        }
    });

    let mut indices = [0; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL];

    // Using the bounded vec here because we know the length of the array.
    for i in 0..side_effect_ranges.len() {
        let range = sorted_side_effect_ranges[i];
        indices[range.side_effect_global_index] = i;
    }

    SideEffectUniquenessHints {
        side_effect_ranges: sorted_side_effect_ranges,
        note_hash_read_request_indices: subarray(
            indices,
            GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        ),
        nullifier_read_request_indices: subarray(
            indices,
            GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        ),
        note_hashes_indices: subarray(indices, GLOBAL_INDEX_NOTE_HASH_OFFSET),
        nullifiers_indices: subarray(indices, GLOBAL_INDEX_NULLIFIER_OFFSET),
        private_call_requests_indices: subarray(indices, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET),
        public_call_requests_indices: subarray(indices, GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET),
        l2_to_l1_msgs_indices: subarray(indices, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET),
        private_logs_indices: subarray(indices, GLOBAL_INDEX_PRIVATE_LOG_OFFSET),
        contract_class_logs_hashes_indices: subarray(
            indices,
            GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        ),
    }
}
