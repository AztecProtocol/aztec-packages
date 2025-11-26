use crate::abis::PaddedSideEffectAmounts;
use super::TestBuilder;
use dep::types::{
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    tests::utils::{assert_array_eq, swap_items},
    utils::arrays::subarray,
};

#[test]
fn split_note_hashes() {
    let mut builder = TestBuilder::new();

    // Expect 2 non-revertible note hashes.
    builder.previous_kernel.append_siloed_note_hashes(2);
    builder.previous_kernel.end_setup();

    // Expect 3 revertible note hashes.
    builder.previous_kernel.append_siloed_note_hashes(3);

    let public_inputs = builder.execute();

    let exposed_note_hashes =
        builder.previous_kernel.note_hashes.storage().map(|n| n.expose_to_public());

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.note_hashes,
        [exposed_note_hashes[0], exposed_note_hashes[1]],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.note_hashes,
        [exposed_note_hashes[2], exposed_note_hashes[3], exposed_note_hashes[4]],
    );
}

#[test]
fn split_nullifiers() {
    let mut builder = TestBuilder::new();

    // Expect 3 non-revertible nullifiers: the protocol nullifier + 2 new ones
    builder.previous_kernel.append_siloed_nullifiers(2);
    builder.previous_kernel.end_setup();

    // Expect 2 revertible nullifiers.
    builder.previous_kernel.append_siloed_nullifiers(2);

    let public_inputs = builder.execute();

    let output_nullifiers =
        builder.previous_kernel.nullifiers.storage().map(|n| n.expose_to_public());

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.nullifiers,
        [output_nullifiers[0], output_nullifiers[1], output_nullifiers[2]],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.nullifiers,
        [output_nullifiers[3], output_nullifiers[4]],
    );
}

#[test]
fn split_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    // Expect 1 non-revertible l2 to l1 msgs.
    builder.previous_kernel.append_l2_to_l1_msgs(1);
    builder.previous_kernel.end_setup();

    // Expect 2 revertible l2 to l1 msgs.
    builder.previous_kernel.append_l2_to_l1_msgs(2);

    let public_inputs = builder.execute();

    let output_l2_to_l1_msgs =
        builder.previous_kernel.l2_to_l1_msgs.storage().map(|m| m.expose_to_public());

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.l2_to_l1_msgs,
        [output_l2_to_l1_msgs[0]],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.l2_to_l1_msgs,
        [output_l2_to_l1_msgs[1], output_l2_to_l1_msgs[2]],
    );
}

#[test]
fn split_private_logs() {
    let mut builder = TestBuilder::new();

    // Expect 2 non-revertible private logs.
    builder.previous_kernel.append_siloed_private_logs(2);
    builder.previous_kernel.end_setup();

    // Expect 3 revertible private logs.
    builder.previous_kernel.append_siloed_private_logs(3);

    let exposed_private_logs =
        builder.previous_kernel.private_logs.storage().map(|l| l.expose_to_public());

    let public_inputs = builder.execute();

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.private_logs,
        [exposed_private_logs[0], exposed_private_logs[1]],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.private_logs,
        [exposed_private_logs[2], exposed_private_logs[3], exposed_private_logs[4]],
    );
}

#[test]
fn split_contract_class_log_hash_into_non_revertible() {
    let mut builder = TestBuilder::new();

    // Expect the contract class log hash to be non-revertible.
    builder.previous_kernel.append_contract_class_logs(1);

    builder.previous_kernel.end_setup();

    let public_inputs = builder.execute();

    let output_contract_class_log_hash =
        builder.previous_kernel.contract_class_logs_hashes.get(0).expose_to_public();

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.contract_class_logs_hashes,
        [output_contract_class_log_hash],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.contract_class_logs_hashes,
        [],
    );
}

#[test]
fn split_contract_class_log_hash_into_revertible() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.end_setup();

    // Expect the contract class log hash to be revertible.
    builder.previous_kernel.append_contract_class_logs(1);

    let public_inputs = builder.execute();

    let output_contract_class_log_hash =
        builder.previous_kernel.contract_class_logs_hashes.get(0).expose_to_public();

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.contract_class_logs_hashes,
        [],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.contract_class_logs_hashes,
        [output_contract_class_log_hash],
    );
}

#[test]
fn split_public_call_requests() {
    let mut builder = TestBuilder::new();

    // Expect 2 non-revertible public call requests. Including the default public call request added by the builder.
    builder.previous_kernel.append_public_call_requests(1);
    builder.previous_kernel.end_setup();

    // Expect 3 revertible public call requests.
    builder.previous_kernel.append_public_call_requests(3);

    let public_inputs = builder.execute();

    let output_public_call_requests =
        builder.previous_kernel.public_call_requests.storage().map(|r| r.expose_to_public());

    assert_array_eq(
        public_inputs.non_revertible_accumulated_data.public_call_requests,
        [output_public_call_requests[0], output_public_call_requests[1]],
    );

    assert_array_eq(
        public_inputs.revertible_accumulated_data.public_call_requests,
        [
            output_public_call_requests[2],
            output_public_call_requests[3],
            output_public_call_requests[4],
        ],
    );
}

#[test]
fn split_all_side_effects() {
    let mut builder = TestBuilder::new();

    // Non-revertible.
    builder.previous_kernel.append_siloed_note_hashes(4);
    builder.previous_kernel.append_siloed_nullifiers(2);
    builder.previous_kernel.append_l2_to_l1_msgs(1);
    builder.previous_kernel.append_siloed_private_logs_with_lengths([8, 11]);
    builder.previous_kernel.append_contract_class_logs_with_lengths([9]);
    builder.previous_kernel.append_public_call_requests(1);
    builder.previous_kernel.set_public_teardown_call_request();

    // Get the current counter to set it as the min_revertible_side_effect_counter later.
    let min_revertible_side_effect_counter = builder.previous_kernel.counter;

    // Revertible.
    builder.previous_kernel.append_siloed_note_hashes(2);
    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.append_l2_to_l1_msgs(1);
    builder.previous_kernel.append_siloed_private_logs_with_lengths([7]);
    builder.previous_kernel.append_public_call_requests(3);

    // Get ordered items before shuffling for verifying with the output later.
    // Set the min_revertible_side_effect_counter to 0 so that everything is included in the revertible data.
    builder.previous_kernel.min_revertible_side_effect_counter = 0;
    let data = builder.previous_kernel.to_private_to_public_accumulated_data(true /* revertible */);

    // Set the correct min_revertible_side_effect_counter.
    builder.previous_kernel.min_revertible_side_effect_counter = min_revertible_side_effect_counter;
    builder.previous_kernel.claimed_revertible_counter = min_revertible_side_effect_counter;

    // Shuffle ordered items.
    swap_items(&mut builder.previous_kernel.l2_to_l1_msgs, 0, 1);
    swap_items(&mut builder.previous_kernel.public_call_requests, 1, 3);

    // Output.
    let output = builder.execute();

    // note_hashes
    let note_hashes = data.note_hashes;
    assert_array_eq(
        output.non_revertible_accumulated_data.note_hashes,
        [note_hashes[0], note_hashes[1], note_hashes[2], note_hashes[3]],
    );
    assert_array_eq(
        output.revertible_accumulated_data.note_hashes,
        [note_hashes[4], note_hashes[5]],
    );

    // nullifiers
    let nullifiers = data.nullifiers;
    assert_array_eq(
        output.non_revertible_accumulated_data.nullifiers,
        [nullifiers[0], nullifiers[1], nullifiers[2]],
    );
    assert_array_eq(
        output.revertible_accumulated_data.nullifiers,
        [nullifiers[3]],
    );

    // l2_to_l1_msgs
    let msgs = data.l2_to_l1_msgs;
    assert_array_eq(
        output.non_revertible_accumulated_data.l2_to_l1_msgs,
        [msgs[0]],
    );
    assert_array_eq(output.revertible_accumulated_data.l2_to_l1_msgs, [msgs[1]]);

    // private_logs
    let private_logs = data.private_logs;
    assert_array_eq(
        output.non_revertible_accumulated_data.private_logs,
        [private_logs[0], private_logs[1]],
    );
    assert_array_eq(
        output.revertible_accumulated_data.private_logs,
        [private_logs[2]],
    );

    // contract_class_logs_hashes
    let log_hashes = data.contract_class_logs_hashes;
    assert_array_eq(
        output.non_revertible_accumulated_data.contract_class_logs_hashes,
        [log_hashes[0]],
    );

    // public_call_requests
    let public_call_requests = data.public_call_requests;
    assert_array_eq(
        output.non_revertible_accumulated_data.public_call_requests,
        [public_call_requests[0], public_call_requests[1]],
    );
    assert_array_eq(
        output.revertible_accumulated_data.public_call_requests,
        [public_call_requests[2], public_call_requests[3], public_call_requests[4]],
    );

    // Public teardown call request.
    assert_eq(
        output.public_teardown_call_request,
        builder.previous_kernel.public_teardown_call_request,
    );
}

// Constants for the next test.
global NumNoteHashesNonRevertible: u32 = 6;
global NumNullifiersNonRevertible: u32 = 7;
global NumL2ToL1MsgsNonRevertible: u32 = 2;
global NumPrivateLogsNonRevertible: u32 = 4;
global NumPublicCallsNonRevertible: u32 = 3;

#[test]
fn split_full_side_effects() {
    let mut builder = TestBuilder::new();

    // Non-revertible.
    builder.previous_kernel.append_siloed_note_hashes(NumNoteHashesNonRevertible);
    builder.previous_kernel.append_siloed_nullifiers(NumNullifiersNonRevertible - 1); // -1 for the first nullifier added by the builder.
    builder.previous_kernel.append_l2_to_l1_msgs(NumL2ToL1MsgsNonRevertible);
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        NumPrivateLogsNonRevertible,
    );
    builder
        .previous_kernel
        .append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
            MAX_CONTRACT_CLASS_LOGS_PER_TX,
        );
    builder.previous_kernel.append_public_call_requests(NumPublicCallsNonRevertible - 1); // -1 for the call request added by the builder.

    // Get the current counter to set it as the min_revertible_side_effect_counter later.
    let min_revertible_side_effect_counter = builder.previous_kernel.counter;

    // Revertible.
    builder.previous_kernel.set_public_teardown_call_request();

    builder.previous_kernel.append_siloed_note_hashes(
        MAX_NOTE_HASHES_PER_TX - NumNoteHashesNonRevertible,
    );
    builder.previous_kernel.append_siloed_nullifiers(
        MAX_NULLIFIERS_PER_TX - NumNullifiersNonRevertible,
    );
    builder.previous_kernel.append_l2_to_l1_msgs(
        MAX_L2_TO_L1_MSGS_PER_TX - NumL2ToL1MsgsNonRevertible,
    );
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX - NumPrivateLogsNonRevertible,
    );
    builder.previous_kernel.append_public_call_requests(
        MAX_ENQUEUED_CALLS_PER_TX - NumPublicCallsNonRevertible,
    );

    // Get ordered items before shuffling for verifying with the output later.
    // Set the min_revertible_side_effect_counter to 0 so that everything is included in the revertible data.
    builder.previous_kernel.min_revertible_side_effect_counter = 0;
    let data = builder.previous_kernel.to_private_to_public_accumulated_data(true /* revertible */);

    // Set the min_revertible_side_effect_counter.
    builder.previous_kernel.min_revertible_side_effect_counter = min_revertible_side_effect_counter;
    builder.previous_kernel.claimed_revertible_counter = min_revertible_side_effect_counter;

    // Shuffle ordered items.
    swap_items(&mut builder.previous_kernel.l2_to_l1_msgs, 0, 1);
    swap_items(&mut builder.previous_kernel.l2_to_l1_msgs, 2, 5);
    swap_items(&mut builder.previous_kernel.public_call_requests, 1, 3);
    swap_items(&mut builder.previous_kernel.public_call_requests, 0, 7);
    swap_items(&mut builder.previous_kernel.public_call_requests, 5, 6);

    // Output.
    let output = builder.execute();

    // note_hashes
    let note_hashes = data.note_hashes;
    assert_array_eq(
        output.non_revertible_accumulated_data.note_hashes,
        subarray::<_, _, NumNoteHashesNonRevertible>(note_hashes, 0),
    );
    assert_array_eq(
        output.revertible_accumulated_data.note_hashes,
        subarray::<_, _, MAX_NOTE_HASHES_PER_TX - NumNoteHashesNonRevertible>(
            note_hashes,
            NumNoteHashesNonRevertible,
        ),
    );

    // nullifiers
    let nullifiers = data.nullifiers;
    assert_array_eq(
        output.non_revertible_accumulated_data.nullifiers,
        subarray::<_, _, NumNullifiersNonRevertible>(nullifiers, 0),
    );
    assert_array_eq(
        output.revertible_accumulated_data.nullifiers,
        subarray::<_, _, MAX_NULLIFIERS_PER_TX - NumNullifiersNonRevertible>(
            nullifiers,
            NumNullifiersNonRevertible,
        ),
    );

    // l2_to_l1_msgs
    let msgs = data.l2_to_l1_msgs;
    assert_array_eq(
        output.non_revertible_accumulated_data.l2_to_l1_msgs,
        subarray::<_, _, NumL2ToL1MsgsNonRevertible>(msgs, 0),
    );
    assert_array_eq(
        output.revertible_accumulated_data.l2_to_l1_msgs,
        subarray::<_, _, MAX_L2_TO_L1_MSGS_PER_TX - NumL2ToL1MsgsNonRevertible>(
            msgs,
            NumL2ToL1MsgsNonRevertible,
        ),
    );

    // private_logs
    let private_logs = data.private_logs;
    assert_array_eq(
        output.non_revertible_accumulated_data.private_logs,
        subarray::<_, _, NumPrivateLogsNonRevertible>(private_logs, 0),
    );
    assert_array_eq(
        output.revertible_accumulated_data.private_logs,
        subarray::<_, _, MAX_PRIVATE_LOGS_PER_TX - NumPrivateLogsNonRevertible>(
            private_logs,
            NumPrivateLogsNonRevertible,
        ),
    );

    // contract_class_logs_hashes
    let log_hashes = data.contract_class_logs_hashes;
    assert_array_eq(
        output.non_revertible_accumulated_data.contract_class_logs_hashes,
        [log_hashes[0]],
    );
    assert_array_eq(
        output.revertible_accumulated_data.contract_class_logs_hashes,
        [],
    );

    // public_call_requests
    let public_call_requests = data.public_call_requests;
    assert_array_eq(
        output.non_revertible_accumulated_data.public_call_requests,
        subarray::<_, _, NumPublicCallsNonRevertible>(public_call_requests, 0),
    );
    assert_array_eq(
        output.revertible_accumulated_data.public_call_requests,
        subarray::<_, _, MAX_ENQUEUED_CALLS_PER_TX - NumPublicCallsNonRevertible>(
            public_call_requests,
            NumPublicCallsNonRevertible,
        ),
    );

    // Public teardown call request.
    assert_eq(
        output.public_teardown_call_request,
        builder.previous_kernel.public_teardown_call_request,
    );
}

#[test]
fn split_side_effects_with_padded_items() {
    let mut builder = TestBuilder::new();

    // Non-revertibles.
    builder.previous_kernel.append_siloed_note_hashes(2);
    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.append_siloed_private_logs(1);

    // Get the current counter as the min_revertible_side_effect_counter.
    let min_revertible_side_effect_counter = builder.previous_kernel.counter;

    // Revertibles.
    builder.previous_kernel.append_siloed_note_hashes(3);
    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.append_siloed_private_logs(2);

    // Paddings.
    builder.previous_kernel.append_padded_note_hashes(3);
    builder.previous_kernel.append_padded_nullifiers(5);
    builder.previous_kernel.append_padded_private_logs(2);

    // Set the min_revertible_side_effect_counter to 0 so that everything is included in the revertible data.
    builder.previous_kernel.min_revertible_side_effect_counter = 0;
    let data = builder.previous_kernel.to_private_to_public_accumulated_data(true /* revertible */);

    // Set the min_revertible_side_effect_counter.
    builder.previous_kernel.min_revertible_side_effect_counter = min_revertible_side_effect_counter;
    builder.previous_kernel.claimed_revertible_counter = min_revertible_side_effect_counter;

    builder.padded_side_effect_amounts = PaddedSideEffectAmounts {
        non_revertible_note_hashes: 3,
        revertible_note_hashes: 0,
        non_revertible_nullifiers: 2,
        revertible_nullifiers: 3,
        non_revertible_private_logs: 0,
        revertible_private_logs: 2,
    };

    let public_inputs = builder.execute();
    let non_revertible = public_inputs.non_revertible_accumulated_data;
    let revertible = public_inputs.revertible_accumulated_data;

    // note_hashes
    let note_hashes = data.note_hashes;
    assert_array_eq(
        non_revertible.note_hashes,
        [note_hashes[0], note_hashes[1], note_hashes[5], note_hashes[6], note_hashes[7]],
    );
    assert_array_eq(
        revertible.note_hashes,
        [note_hashes[2], note_hashes[3], note_hashes[4]],
    );

    // nullifiers
    let nullifiers = data.nullifiers;
    assert_array_eq(
        non_revertible.nullifiers,
        [nullifiers[0], nullifiers[1], nullifiers[3], nullifiers[4]],
    );
    assert_array_eq(
        revertible.nullifiers,
        [nullifiers[2], nullifiers[5], nullifiers[6], nullifiers[7]],
    );

    // private_logs
    let private_logs = data.private_logs;
    assert_array_eq(non_revertible.private_logs, [private_logs[0]]);
    assert_array_eq(
        revertible.private_logs,
        [private_logs[1], private_logs[2], private_logs[3], private_logs[4]],
    );
}

#[test(should_fail_with = "padded note hash amount is too small")]
fn padded_num_non_revertible_note_hash_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_note_hashes(1);

    builder.previous_kernel.append_padded_note_hashes(2);

    // There are 2 padded note hashes, but we only pad 1.
    builder.padded_side_effect_amounts.non_revertible_note_hashes = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded non-revertible note hash amount is too large")]
fn padded_num_non_revertible_note_hash_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_note_hashes(1);

    builder.previous_kernel.append_padded_note_hashes(2);

    // There are only 2 padded note hashes, but we pad 3.
    builder.padded_side_effect_amounts.non_revertible_note_hashes = 3;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded note hash amount is too small")]
fn padded_num_revertible_note_hash_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_note_hashes(1);

    builder.previous_kernel.append_padded_note_hashes(2);

    // There are 2 padded note hashes, but we only pad 1.
    builder.padded_side_effect_amounts.revertible_note_hashes = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded revertible note hash amount is too large")]
fn padded_num_revertible_note_hash_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_note_hashes(1);

    builder.previous_kernel.append_padded_note_hashes(2);

    // There are only 2 padded note hashes, but we pad 3.
    builder.padded_side_effect_amounts.revertible_note_hashes = 3;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded nullifier amount is too small")]
fn padded_num_non_revertible_nullifier_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_nullifiers(1);

    builder.previous_kernel.append_padded_nullifiers(2);

    // There are 2 padded nullifiers, but we only pad 1.
    builder.padded_side_effect_amounts.non_revertible_nullifiers = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded non-revertible nullifier amount is too large")]
fn padded_num_non_revertible_nullifier_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_nullifiers(1);

    builder.previous_kernel.append_padded_nullifiers(2);

    // There are only 2 padded nullifiers, but we pad 3.
    builder.padded_side_effect_amounts.non_revertible_nullifiers = 3;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded nullifier amount is too small")]
fn padded_num_revertible_nullifier_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_nullifiers(1);

    builder.previous_kernel.append_padded_nullifiers(2);

    // There are 2 padded nullifiers, but we only pad 1.
    builder.padded_side_effect_amounts.revertible_nullifiers = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded revertible nullifier amount is too large")]
fn padded_num_revertible_nullifier_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_nullifiers(1);

    builder.previous_kernel.append_padded_nullifiers(2);

    // There are only 2 padded nullifiers, but we pad 3.
    builder.padded_side_effect_amounts.revertible_nullifiers = 3;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded private log amount is too small")]
fn padded_num_non_revertible_private_log_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_private_logs(1);

    builder.previous_kernel.append_padded_private_logs(2);

    // There are 2 padded private logs, but we only pad 1.
    builder.padded_side_effect_amounts.non_revertible_private_logs = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded non-revertible private log amount is too large")]
fn padded_num_non_revertible_private_log_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_private_logs(1);

    builder.previous_kernel.append_padded_private_logs(2);

    // There are only 2 padded private logs, but we pad 3.
    builder.padded_side_effect_amounts.non_revertible_private_logs = 3;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded private log amount is too small")]
fn padded_num_revertible_private_log_too_small() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_private_logs(1);

    builder.previous_kernel.append_padded_private_logs(2);

    // There are 2 padded private logs, but we only pad 1.
    builder.padded_side_effect_amounts.revertible_private_logs = 1;

    let _ = builder.execute();
}

#[test(should_fail_with = "padded revertible private log amount is too large")]
fn padded_num_revertible_private_log_too_large() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_private_logs(1);

    builder.previous_kernel.append_padded_private_logs(2);

    // There are only 2 padded private logs, but we pad 3.
    builder.padded_side_effect_amounts.revertible_private_logs = 3;

    let _ = builder.execute();
}
