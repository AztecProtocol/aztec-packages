use crate::abis::PaddedSideEffectAmounts;
use dep::types::{
    abis::{
        accumulated_data::{
            private_accumulated_data_builder::PrivateAccumulatedDataBuilder,
            private_to_public_accumulated_data::PrivateToPublicAccumulatedData,
            private_to_public_accumulated_data_builder::PrivateToPublicAccumulatedDataBuilder,
        },
        side_effect::{Ordered, OrderedValue},
    },
    constants::MAX_U32_VALUE,
    traits::Empty,
};

pub unconstrained fn split_to_public(
    data: PrivateAccumulatedDataBuilder,
    min_revertible_side_effect_counter: u32,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
) -> (PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData) {
    let mut non_revertible_builder = PrivateToPublicAccumulatedDataBuilder::empty();
    let mut revertible_builder = PrivateToPublicAccumulatedDataBuilder::empty();

    let note_hashes = data.note_hashes;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_note_hashes;
    let mut padded_revertible = padded_side_effect_amounts.revertible_note_hashes;
    for i in 0..note_hashes.array.len() {
        if i < note_hashes.length {
            let note_hash = note_hashes.array[i];
            let is_padding = note_hash.counter() == MAX_U32_VALUE;
            if (note_hash.counter() < min_revertible_side_effect_counter)
                | (is_padding & (padded_non_revertible != 0)) {
                non_revertible_builder.note_hashes.push(note_hash.value());
                padded_non_revertible -= 1 * is_padding as u32;
            } else {
                revertible_builder.note_hashes.push(note_hash.value());
                assert(
                    !is_padding | (padded_revertible != 0),
                    "padded note hash amount is too small",
                );
                padded_revertible -= 1 * is_padding as u32;
            }
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible note hash amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible note hash amount is too large");

    let nullifiers = data.nullifiers;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_nullifiers;
    let mut padded_revertible = padded_side_effect_amounts.revertible_nullifiers;
    for i in 0..nullifiers.array.len() {
        if i < nullifiers.length {
            let nullifier = nullifiers.array[i];
            let is_padding = nullifier.counter() == MAX_U32_VALUE;
            if (nullifier.counter() < min_revertible_side_effect_counter)
                | (is_padding & (padded_non_revertible != 0)) {
                non_revertible_builder.nullifiers.push(nullifier.value());
                padded_non_revertible -= 1 * is_padding as u32;
            } else {
                revertible_builder.nullifiers.push(nullifier.value());
                assert(
                    !is_padding | (padded_revertible != 0),
                    "padded nullifier amount is too small",
                );
                padded_revertible -= 1 * is_padding as u32;
            }
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible nullifier amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible nullifier amount is too large");

    let l2_to_l1_msgs = data.l2_to_l1_msgs;
    for i in 0..l2_to_l1_msgs.array.len() {
        if i < l2_to_l1_msgs.length {
            let msg = l2_to_l1_msgs.array[i];
            if msg.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.l2_to_l1_msgs.push(msg.expose_to_public());
            } else {
                revertible_builder.l2_to_l1_msgs.push(msg.expose_to_public());
            }
        }
    }

    let private_logs = data.private_logs;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_private_logs;
    let mut padded_revertible = padded_side_effect_amounts.revertible_private_logs;
    for i in 0..private_logs.array.len() {
        if i < private_logs.length {
            let private_log = private_logs.array[i];
            let is_padding = private_log.counter() == MAX_U32_VALUE;
            if (private_log.counter() < min_revertible_side_effect_counter)
                | (is_padding & (padded_non_revertible != 0)) {
                non_revertible_builder.private_logs.push(private_log.expose_to_public());
                padded_non_revertible -= 1 * is_padding as u32;
            } else {
                revertible_builder.private_logs.push(private_log.expose_to_public());
                assert(
                    !is_padding | (padded_revertible != 0),
                    "padded private log amount is too small",
                );
                padded_revertible -= 1 * is_padding as u32;
            }
        }
    }

    assert_eq(padded_non_revertible, 0, "padded non-revertible private log amount is too large");
    assert_eq(padded_revertible, 0, "padded revertible private log amount is too large");

    let contract_class_logs_hashes = data.contract_class_logs_hashes;
    for i in 0..contract_class_logs_hashes.array.len() {
        if i < contract_class_logs_hashes.length {
            let contract_class_log_hash = contract_class_logs_hashes.array[i];
            let public_log_hash = contract_class_log_hash.expose_to_public();
            if contract_class_log_hash.counter() < min_revertible_side_effect_counter {
                non_revertible_builder.contract_class_logs_hashes.push(public_log_hash);
            } else {
                revertible_builder.contract_class_logs_hashes.push(public_log_hash);
            }
        }
    }

    let public_call_requests = data.public_call_requests;
    for i in 0..public_call_requests.array.len() {
        if i < public_call_requests.length {
            let call_request = public_call_requests.array[i];
            if call_request.counter < min_revertible_side_effect_counter {
                non_revertible_builder.public_call_requests.push(call_request.inner);
            } else {
                revertible_builder.public_call_requests.push(call_request.inner);
            }
        }
    }

    (non_revertible_builder.finish(), revertible_builder.finish())
}
