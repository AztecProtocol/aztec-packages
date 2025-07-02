use crate::{
    abis::PaddedSideEffectAmounts, components::tail_to_public_output_composer::split_to_public,
};
use dep::types::{tests::{fixture_builder::FixtureBuilder, utils::assert_array_eq}, traits::Empty};

#[test]
fn split_to_public__succeeds() {
    let mut builder = FixtureBuilder::new();

    // Non-revertibles.
    builder.append_note_hashes(2);
    builder.append_nullifiers(2);
    builder.append_l2_to_l1_msgs(1);
    builder.append_private_logs(2);
    builder.add_contract_class_log_hash(2, 200);
    builder.append_public_call_requests(1);

    // Get the current counter as the min_revertible_side_effect_counter.
    let min_revertible_side_effect_counter = builder.counter;

    // Revertibles.
    builder.append_note_hashes(3);
    builder.append_nullifiers(1);
    builder.append_l2_to_l1_msgs(1);
    builder.append_private_logs(2);
    builder.append_public_call_requests(2);

    // The min_revertible_side_effect_counter is not set, so everything is included in the non-revertible accumulated data.
    let combined_data = builder.to_private_to_public_accumulated_data(false /* revertible */);

    let padded_side_effect_amounts = PaddedSideEffectAmounts::empty();

    // Safety: This is a test.
    let (non_revertible, revertible) = unsafe {
        split_to_public(
            builder.to_private_accumulated_data_builder(),
            min_revertible_side_effect_counter,
            padded_side_effect_amounts,
        )
    };

    // note_hashes
    let expected = combined_data.note_hashes;
    assert_array_eq(non_revertible.note_hashes, [expected[0], expected[1]]);
    assert_array_eq(
        revertible.note_hashes,
        [expected[2], expected[3], expected[4]],
    );

    // nullifiers
    let expected = combined_data.nullifiers;
    assert_array_eq(non_revertible.nullifiers, [expected[0], expected[1]]);
    assert_array_eq(revertible.nullifiers, [expected[2]]);

    // l2_to_l1_msgs
    let expected = combined_data.l2_to_l1_msgs;
    assert_array_eq(non_revertible.l2_to_l1_msgs, [expected[0]]);
    assert_array_eq(revertible.l2_to_l1_msgs, [expected[1]]);

    // private_logs
    let expected = combined_data.private_logs;
    assert_array_eq(non_revertible.private_logs, [expected[0], expected[1]]);
    assert_array_eq(revertible.private_logs, [expected[2], expected[3]]);

    // contract_class_logs_hashes
    let expected = combined_data.contract_class_logs_hashes;
    assert_array_eq(non_revertible.contract_class_logs_hashes, [expected[0]]);
    assert_array_eq(revertible.contract_class_logs_hashes, []);

    // public_call_requests
    let call_requests = combined_data.public_call_requests;
    assert_array_eq(non_revertible.public_call_requests, [call_requests[0]]);
    assert_array_eq(
        revertible.public_call_requests,
        [call_requests[1], call_requests[2]],
    );
}

#[test]
fn split_to_public__with_padded_succeeds() {
    let mut builder = FixtureBuilder::new();

    // Non-revertibles.
    builder.append_note_hashes(2);
    builder.append_nullifiers(2);
    builder.append_private_logs(1);

    // Get the current counter as the min_revertible_side_effect_counter.
    let min_revertible_side_effect_counter = builder.counter;

    // Revertibles.
    builder.append_note_hashes(3);
    builder.append_nullifiers(1);
    builder.append_private_logs(2);
    // Padding.
    builder.append_padded_note_hashes(3);
    builder.append_padded_nullifiers(5);
    builder.append_padded_private_logs(2);

    // The min_revertible_side_effect_counter is not set, so everything is included in the non-revertible accumulated data.
    let combined_data = builder.to_private_to_public_accumulated_data(false /* revertible */);

    let padded_side_effect_amounts = PaddedSideEffectAmounts {
        non_revertible_note_hashes: 3,
        revertible_note_hashes: 0,
        non_revertible_nullifiers: 2,
        revertible_nullifiers: 3,
        non_revertible_private_logs: 0,
        revertible_private_logs: 2,
    };

    // Safety: This is a test.
    let (non_revertible, revertible) = unsafe {
        split_to_public(
            builder.to_private_accumulated_data_builder(),
            min_revertible_side_effect_counter,
            padded_side_effect_amounts,
        )
    };

    // note_hashes
    let combined = combined_data.note_hashes;
    assert_array_eq(
        non_revertible.note_hashes,
        [combined[0], combined[1], combined[5], combined[6], combined[7]],
    );
    assert_array_eq(
        revertible.note_hashes,
        [combined[2], combined[3], combined[4]],
    );

    // nullifiers
    let combined = combined_data.nullifiers;
    assert_array_eq(
        non_revertible.nullifiers,
        [combined[0], combined[1], combined[3], combined[4]],
    );
    assert_array_eq(
        revertible.nullifiers,
        [combined[2], combined[5], combined[6], combined[7]],
    );

    // private_logs
    let combined = combined_data.private_logs;
    assert_array_eq(non_revertible.private_logs, [combined[0]]);
    assert_array_eq(
        revertible.private_logs,
        [combined[1], combined[2], combined[3], combined[4]],
    );
}

#[test(should_fail_with = "padded note hash amount is too small")]
unconstrained fn split_to_public__with_padded_num_non_revertible_note_hash_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_note_hashes(1);
    builder.end_setup();
    builder.append_note_hashes(1);

    builder.append_padded_note_hashes(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded note hashes, but we only pad 1.
    padded_side_effect_amounts.non_revertible_note_hashes = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded non-revertible note hash amount is too large")]
unconstrained fn split_to_public__with_padded_num_non_revertible_note_hash_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_note_hashes(1);
    builder.end_setup();
    builder.append_note_hashes(1);

    builder.append_padded_note_hashes(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded note hashes, but we pad 3.
    padded_side_effect_amounts.non_revertible_note_hashes = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded note hash amount is too small")]
unconstrained fn split_to_public__with_padded_num_revertible_note_hash_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_note_hashes(1);
    builder.end_setup();
    builder.append_note_hashes(1);

    builder.append_padded_note_hashes(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded note hashes, but we only pad 1.
    padded_side_effect_amounts.revertible_note_hashes = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded revertible note hash amount is too large")]
unconstrained fn split_to_public__with_padded_num_revertible_note_hash_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_note_hashes(1);
    builder.end_setup();
    builder.append_note_hashes(1);

    builder.append_padded_note_hashes(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded note hashes, but we pad 3.
    padded_side_effect_amounts.revertible_note_hashes = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded nullifier amount is too small")]
unconstrained fn split_to_public__with_padded_num_non_revertible_nullifier_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_nullifiers(1);
    builder.end_setup();
    builder.append_nullifiers(1);

    builder.append_padded_nullifiers(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded nullifiers, but we only pad 1.
    padded_side_effect_amounts.non_revertible_nullifiers = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded non-revertible nullifier amount is too large")]
unconstrained fn split_to_public__with_padded_num_non_revertible_nullifier_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_nullifiers(1);
    builder.end_setup();
    builder.append_nullifiers(1);

    builder.append_padded_nullifiers(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded nullifiers, but we pad 3.
    padded_side_effect_amounts.non_revertible_nullifiers = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded nullifier amount is too small")]
unconstrained fn split_to_public__with_padded_num_revertible_nullifier_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_nullifiers(1);
    builder.end_setup();
    builder.append_nullifiers(1);

    builder.append_padded_nullifiers(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded nullifiers, but we only pad 1.
    padded_side_effect_amounts.revertible_nullifiers = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded revertible nullifier amount is too large")]
unconstrained fn split_to_public__with_padded_num_revertible_nullifier_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_nullifiers(1);
    builder.end_setup();
    builder.append_nullifiers(1);

    builder.append_padded_nullifiers(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded nullifiers, but we pad 3.
    padded_side_effect_amounts.revertible_nullifiers = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded private log amount is too small")]
unconstrained fn split_to_public__with_padded_num_non_revertible_private_log_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_private_logs(1);
    builder.end_setup();
    builder.append_private_logs(1);

    builder.append_padded_private_logs(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded private logs, but we only pad 1.
    padded_side_effect_amounts.non_revertible_private_logs = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded non-revertible private log amount is too large")]
unconstrained fn split_to_public__with_padded_num_non_revertible_private_log_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_private_logs(1);
    builder.end_setup();
    builder.append_private_logs(1);

    builder.append_padded_private_logs(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded private logs, but we pad 3.
    padded_side_effect_amounts.non_revertible_private_logs = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded private log amount is too small")]
unconstrained fn split_to_public__with_padded_num_revertible_private_log_too_small_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_private_logs(1);
    builder.end_setup();
    builder.append_private_logs(1);

    builder.append_padded_private_logs(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are 2 padded private logs, but we only pad 1.
    padded_side_effect_amounts.revertible_private_logs = 1;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}

#[test(should_fail_with = "padded revertible private log amount is too large")]
unconstrained fn split_to_public__with_padded_num_revertible_private_log_too_large_fails() {
    let mut builder = FixtureBuilder::new();

    builder.append_private_logs(1);
    builder.end_setup();
    builder.append_private_logs(1);

    builder.append_padded_private_logs(2);

    let mut padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
    // There are only 2 padded private logs, but we pad 3.
    padded_side_effect_amounts.revertible_private_logs = 3;

    let _ = split_to_public(
        builder.to_private_accumulated_data_builder(),
        builder.min_revertible_side_effect_counter,
        padded_side_effect_amounts,
    );
}
