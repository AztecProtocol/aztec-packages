use crate::abis::PaddedSideEffectAmounts;
use dep::types::{
    abis::accumulated_data::{PrivateAccumulatedData, PrivateToPublicAccumulatedData},
    constants::MAX_U32_VALUE,
    side_effect::Ordered,
    traits::Empty,
};

fn expose_to_public(data: PrivateAccumulatedData) -> PrivateToPublicAccumulatedData {
    PrivateToPublicAccumulatedData {
        note_hashes: data.note_hashes.array.map(|note_hash| note_hash.expose_to_public()),
        nullifiers: data.nullifiers.array.map(|nullifier| nullifier.expose_to_public()),
        l2_to_l1_msgs: data.l2_to_l1_msgs.array.map(|l2_to_l1_msg| l2_to_l1_msg.expose_to_public()),
        private_logs: data.private_logs.array.map(|private_log| private_log.expose_to_public()),
        contract_class_logs_hashes: data
            .contract_class_logs_hashes
            .array
            .map(|contract_class_log_hash| contract_class_log_hash.expose_to_public()),
        public_call_requests: data.public_call_requests.array.map(|public_call_request| {
            public_call_request.expose_to_public()
        }),
    }
}

pub unconstrained fn split_to_public(
    data: PrivateAccumulatedData,
    min_revertible_side_effect_counter: u32,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
) -> (PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData) {
    let mut non_revertible_data = PrivateAccumulatedData::empty();
    let mut revertible_data = PrivateAccumulatedData::empty();

    let note_hashes = data.note_hashes;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_note_hashes;
    let mut padded_revertible = padded_side_effect_amounts.revertible_note_hashes;
    for i in 0..note_hashes.length {
        let note_hash = note_hashes.array[i];
        let is_padding = note_hash.counter() == MAX_U32_VALUE;
        if (note_hash.counter() < min_revertible_side_effect_counter)
            | (is_padding & (padded_non_revertible != 0)) {
            non_revertible_data.note_hashes.push(note_hash);
            padded_non_revertible -= 1 * is_padding as u32;
        } else {
            revertible_data.note_hashes.push(note_hash);
            assert(!is_padding | (padded_revertible != 0), "padded note hash amount is too small");
            padded_revertible -= 1 * is_padding as u32;
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible note hash amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible note hash amount is too large");

    let nullifiers = data.nullifiers;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_nullifiers;
    let mut padded_revertible = padded_side_effect_amounts.revertible_nullifiers;
    for i in 0..nullifiers.length {
        let nullifier = nullifiers.array[i];
        let is_padding = nullifier.counter() == MAX_U32_VALUE;
        if (nullifier.counter() < min_revertible_side_effect_counter)
            | (is_padding & (padded_non_revertible != 0)) {
            non_revertible_data.nullifiers.push(nullifier);
            padded_non_revertible -= 1 * is_padding as u32;
        } else {
            revertible_data.nullifiers.push(nullifier);
            assert(!is_padding | (padded_revertible != 0), "padded nullifier amount is too small");
            padded_revertible -= 1 * is_padding as u32;
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible nullifier amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible nullifier amount is too large");

    let l2_to_l1_msgs = data.l2_to_l1_msgs;
    for i in 0..l2_to_l1_msgs.length {
        let msg = l2_to_l1_msgs.array[i];
        if msg.counter() < min_revertible_side_effect_counter {
            non_revertible_data.l2_to_l1_msgs.push(msg);
        } else {
            revertible_data.l2_to_l1_msgs.push(msg);
        }
    }

    let private_logs = data.private_logs;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_private_logs;
    let mut padded_revertible = padded_side_effect_amounts.revertible_private_logs;
    for i in 0..private_logs.length {
        let private_log = private_logs.array[i];
        let is_padding = private_log.counter() == MAX_U32_VALUE;
        if (private_log.counter() < min_revertible_side_effect_counter)
            | (is_padding & (padded_non_revertible != 0)) {
            non_revertible_data.private_logs.push(private_log);
            padded_non_revertible -= 1 * is_padding as u32;
        } else {
            revertible_data.private_logs.push(private_log);
            assert(
                !is_padding | (padded_revertible != 0),
                "padded private log amount is too small",
            );
            padded_revertible -= 1 * is_padding as u32;
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible private log amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible private log amount is too large");

    let contract_class_logs_hashes = data.contract_class_logs_hashes;
    for i in 0..contract_class_logs_hashes.length {
        let contract_class_log_hash = contract_class_logs_hashes.array[i];
        if contract_class_log_hash.counter() < min_revertible_side_effect_counter {
            non_revertible_data.contract_class_logs_hashes.push(contract_class_log_hash);
        } else {
            revertible_data.contract_class_logs_hashes.push(contract_class_log_hash);
        }
    }

    let public_call_requests = data.public_call_requests;
    for i in 0..public_call_requests.length {
        let call_request = public_call_requests.array[i];
        if call_request.counter() < min_revertible_side_effect_counter {
            non_revertible_data.public_call_requests.push(call_request);
        } else {
            revertible_data.public_call_requests.push(call_request);
        }
    }

    (expose_to_public(non_revertible_data), expose_to_public(revertible_data))
}
