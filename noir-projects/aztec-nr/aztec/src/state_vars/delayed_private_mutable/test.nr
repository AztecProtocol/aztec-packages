use crate::{
    context::{PrivateContext, UtilityContext},
    note::note_interface::NoteHash,
    state_vars::delayed_private_mutable::{
        delayed_private_mutable_note::DelayedPrivateMutableNote, DelayedPrivateMutable,
    },
    test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote},
};

use protocol_types::{
    delayed_public_mutable::scheduled_delay_change::ScheduledDelayChange,
    hash::{
        compute_note_hash_nonce, compute_siloed_note_hash, compute_siloed_nullifier,
        compute_unique_note_hash,
    },
    traits::Empty,
};

use dep::std::mem::zeroed;

global STORAGE_SLOT: Field = 47;

global INITIAL_VALUE: Field = 17;
global REPLACEMENT_VALUE: Field = 18;

global TEST_INITIAL_DELAY: u64 = 100;
global LONGER_DELAY: u64 = 200;
global SHORTER_DELAY: u64 = 75;

/*******************************************************************************
 * HELPERS
 ******************************************************************************/

unconstrained fn in_private(
    context: &mut PrivateContext,
) -> DelayedPrivateMutable<MockNote, TEST_INITIAL_DELAY, &mut PrivateContext> {
    DelayedPrivateMutable::new(context, STORAGE_SLOT)
}

unconstrained fn in_utility(
    context: UtilityContext,
) -> DelayedPrivateMutable<MockNote, TEST_INITIAL_DELAY, UtilityContext> {
    DelayedPrivateMutable::new(context, STORAGE_SLOT)
}

unconstrained fn get_final_note_hash(context: &mut PrivateContext, i: u32) -> Field {
    let inner_note_hash = context.note_hashes.get(i).value;

    let siloed_note_hash = compute_siloed_note_hash(context.this_address(), inner_note_hash);

    let inner_first_nullifier_in_tx = context.nullifiers.get(i).value;

    let siloed_first_nullifier_in_tx =
        compute_siloed_nullifier(context.this_address(), inner_first_nullifier_in_tx);

    let note_hash_nonce = compute_note_hash_nonce(siloed_first_nullifier_in_tx, 0);

    compute_unique_note_hash(note_hash_nonce, siloed_note_hash)
}

unconstrained fn setup_schedule_initialization(
    env: TestEnvironment,
) -> (DelayedPrivateMutableNote<MockNote, TEST_INITIAL_DELAY>, Field, MockNote, u64) {
    let (initial_wrapper_note_emission, initial_wrapper_note_hash, initial_note, initial_note_timestamp_of_change) = env
        .private_context(|context| {
            let state_var = in_private(context);

            let initial_note = MockNote::new(INITIAL_VALUE).build_note();

            let initial_wrapper_note_emission = state_var.schedule_initialization(initial_note);

            let initial_wrapper_note_hash = get_final_note_hash(context, 0);

            let (_, initial_note_timestamp_of_change) = state_var.get_scheduled_note();

            (
                initial_wrapper_note_emission, initial_wrapper_note_hash, initial_note,
                initial_note_timestamp_of_change,
            )
        });

    env.discover_note(initial_wrapper_note_emission);

    (
        initial_wrapper_note_emission.note, initial_wrapper_note_hash, initial_note,
        initial_note_timestamp_of_change,
    )
}

unconstrained fn setup_initialization_then_replacement(
    env: TestEnvironment,
) -> (MockNote, DelayedPrivateMutableNote<MockNote, TEST_INITIAL_DELAY>, Field, MockNote, u64) {
    let (_, _, initial_note, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // + 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let (replacement_wrapper_note_emission, replacement_wrapper_note_hash, replacement_note) = env
        .private_context(|context| {
            let state_var = in_private(context);

            let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

            let replacement_wrapper_note_emission =
                state_var.schedule_replacement(replacement_note);

            let replacement_wrapper_note_hash = get_final_note_hash(context, 0);

            (replacement_wrapper_note_emission, replacement_wrapper_note_hash, replacement_note)
        });

    env.discover_note(replacement_wrapper_note_emission);

    let (_, replacement_note_timestamp_of_change) = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.get_scheduled_note()
    });

    (
        initial_note, replacement_wrapper_note_emission.note, replacement_wrapper_note_hash,
        replacement_note, replacement_note_timestamp_of_change,
    )
}

unconstrained fn setup_initialization_then_delay_change(
    env: TestEnvironment,
    new_delay: u64,
) -> (MockNote, DelayedPrivateMutableNote<MockNote, TEST_INITIAL_DELAY>, Field, u64) {
    let (_, _, initial_note, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // + 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let (delay_change_wrapper_note_emission, delay_change_wrapper_note_hash) = env
        .private_context(|context| {
            let state_var = in_private(context);

            let delay_change_wrapper_note_emission = state_var.schedule_delay_change(new_delay);

            let delay_change_wrapper_note_hash = get_final_note_hash(context, 0);

            (delay_change_wrapper_note_emission, delay_change_wrapper_note_hash)
        });

    env.discover_note(delay_change_wrapper_note_emission);

    let (_, delay_change_timestamp_of_change) = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.get_scheduled_delay()
    });

    (
        initial_note, delay_change_wrapper_note_emission.note, delay_change_wrapper_note_hash,
        delay_change_timestamp_of_change,
    )
}

/*******************************************************************************
 * SCHEDULE_INITIALIZATION
 ******************************************************************************/

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_current_uninitialized() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.get_current_note();
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_scheduled_uninitialized() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.get_scheduled_note();
    });
}

#[test]
unconstrained fn schedule_initialization() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let initial_note = MockNote::new(INITIAL_VALUE).build_note();

        let wrapper_note_emission = state_var.schedule_initialization(initial_note);

        // During initialization we both create the new note and emit the initialization nullifier
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(context.nullifiers.get(0).value, state_var.compute_initialization_nullifier());

        let wrapper_note = wrapper_note_emission.note;

        let svc = wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let ts = svc.get_timestamp_of_change();

        assert_eq(pre_note, MockNote::empty());
        assert_eq(post_note, initial_note);

        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;
        assert_eq(ts, expected_ts);

        let sdc = wrapper_note.delayed_mutable_values.sdc;
        assert_eq(sdc, ScheduledDelayChange::<TEST_INITIAL_DELAY>::empty());

        assert_eq(wrapper_note_emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn get_current_note_immediately_after_scheduling_initialization() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let initial_note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(initial_note);

        let current_note = state_var.get_current_note();

        // The `initial_note` does not take effect until after a delay (see later tests).
        assert_eq(current_note, MockNote::empty());

        // When we call get_current_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, since we're reading immediately after
        // setting the note, the case "TEST_INITIAL_DELAY amount of time from
        // the anchor timestamp" will bite.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_scheduled_note_immediately_after_scheduling_initialization() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let initial_note = MockNote::new(INITIAL_VALUE).build_note();

        // We don't use the setup_schedule_initialization helper function here, because that
        // function calls `get_scheduled_note` immediately -- which is the very thing we
        // want to test in this test!
        let _ = state_var.schedule_initialization(initial_note);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        // Another interesting point: a timestamp_of_change might get baked into
        // a note, and then some time later in the same tx, a lower
        // include_by_timestamp might get set. That's ok -- it just means the
        // timestamp_of_change could technically have been earlier than was
        // baked-in.
        let expected_scheduled_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, initial_note);
        assert_eq(scheduled_ts, expected_scheduled_ts);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_current_note_just_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, timestamp_of_change) = setup_schedule_initialization(env);

    // Just before scheduled initialization takes effect:
    env.mine_block_at(timestamp_of_change - 1);

    // The context defaults to reading from the latest-mined block as the
    // anchor block.
    env.private_context(|context| {
        let state_var = in_private(context);

        let current_note = state_var.get_current_note();

        // The `initial_note` does not take effect until after a delay (see later tests).
        assert_eq(current_note, MockNote::empty());

        // When we call get_current_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, the anchor block is only 1 second before
        // the timestamp_of_change, so we'll have 0 seconds until the tx expires.
        // This is clearly not a realistic or valid tx.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = timestamp_of_change - 1;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_note_just_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    env.mine_block_at(timestamp_of_change - 1);

    // The context defaults to reading from the latest-mined block as the
    // anchor block.
    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, initial_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, the anchor block is only 1 second before
        // the timestamp_of_change, so we'll have 0 seconds until the tx expires.
        // This is clearly not a realistic or valid tx.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = timestamp_of_change - 1;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_note_at_the_time_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    env.mine_block_at(timestamp_of_change);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change`.
    env.private_context(|context| {
        // Double-check the test env works as expected:
        assert_eq(context.get_anchor_timestamp(), timestamp_of_change);

        let state_var = in_private(context);
        let current_note = state_var.get_current_note();

        assert_eq(current_note, initial_note);
    })
}

#[test]
unconstrained fn get_scheduled_note_at_the_time_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    env.mine_block_at(timestamp_of_change);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change`.
    env.private_context(|context| {
        // Double-check the test env works as expected:
        assert_eq(context.get_anchor_timestamp(), timestamp_of_change);

        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, initial_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);

        // The scheduled and current notes should align, now that the scheduled
        // note has taken effect:
        let current_note = state_var.get_current_note();
        assert_eq(scheduled_note, current_note);
    })
}

#[test]
unconstrained fn get_current_note_after_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    // + 7 is arbitrarily "some time after the expected timestamp of change".
    env.mine_block_at(timestamp_of_change + 7);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change + 7`.
    env.private_context(|context| {
        let state_var = in_private(context);
        let current_note = state_var.get_current_note();

        assert_eq(current_note, initial_note);
    })
}

#[test]
unconstrained fn get_scheduled_note_after_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    // + 7 is arbitrarily "some time after the expected timestamp of change".
    env.mine_block_at(timestamp_of_change + 7);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change + 7`.
    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, initial_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);

        // The scheduled and current notes should align, now that the scheduled
        // note has taken effect:
        let current_note = state_var.get_current_note();
        assert_eq(scheduled_note, current_note);
    })
}

/*******************************************************************************
 * SCHEDULE_REPLACEMENT
 ******************************************************************************/

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn replace_uninitialized() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();
        let _ = state_var.schedule_replacement(note);
    });
}

#[test]
unconstrained fn schedule_replacement_before_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, initial_wrapper_note_hash, _, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Arbitrary choice of 7 for "some time before the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change - 7);

    env.private_context(|context| {
        let state_var = in_private(context);

        let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

        let replacement_wrapper_note_emission = state_var.schedule_replacement(replacement_note);

        // During replacement, we nullify the initial note, and emit the replacement note.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        let expected_nullifier =
            initial_wrapper_note.compute_nullifier(context, initial_wrapper_note_hash);

        assert_eq(context.nullifiers.get(0).value, expected_nullifier);

        let wrapper_note = replacement_wrapper_note_emission.note;

        let svc = wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let ts = svc.get_timestamp_of_change();

        // The `initial_note` will now never take effect, because we over-wrote
        // it with the `replacement_note` _before_ we reached the former's
        // timestamp_of_change. We effectively cancelled the `initial_note`'s
        // scheduling altogether.
        assert_eq(pre_note, MockNote::empty()); // <-- _not_ the initial_note.
        assert_eq(post_note, replacement_note);

        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;
        assert_eq(ts, expected_ts);

        let sdc = wrapper_note.delayed_mutable_values.sdc;
        assert_eq(sdc, ScheduledDelayChange::<TEST_INITIAL_DELAY>::empty());

        assert_eq(replacement_wrapper_note_emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn schedule_replacement_after_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, initial_wrapper_note_hash, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // + 7 is arbitrarily "some time after the initial note's timestamp of change".
    env.mine_block_at(initial_note_timestamp_of_change + 7);

    env.private_context(|context| {
        let state_var = in_private(context);

        let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

        let replacement_wrapper_note_emission = state_var.schedule_replacement(replacement_note);

        // During replacement, we nullify the initial note, and emit the replacement note.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        let expected_nullifier =
            initial_wrapper_note.compute_nullifier(context, initial_wrapper_note_hash);

        assert_eq(context.nullifiers.get(0).value, expected_nullifier);

        let replacement_wrapper_note = replacement_wrapper_note_emission.note;
        let svc = replacement_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let ts = svc.get_timestamp_of_change();

        assert_eq(pre_note, initial_note);
        assert_eq(post_note, replacement_note);

        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;
        assert_eq(ts, expected_ts);

        let sdc = replacement_wrapper_note.delayed_mutable_values.sdc;
        assert_eq(sdc, ScheduledDelayChange::<TEST_INITIAL_DELAY>::empty());

        assert_eq(replacement_wrapper_note_emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn get_current_note_immediately_after_scheduling_replacement() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let replacement_wrapper_note_emission = env.private_context(|context| {
        let state_var = in_private(context);

        let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

        state_var.schedule_replacement(replacement_note)
    });

    env.discover_note(replacement_wrapper_note_emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_note = state_var.get_current_note();

        // The `replacement_note` does not take effect until after a delay (see later tests).
        assert_eq(current_note, initial_note);

        // When we call get_current_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, since we're reading immediately after
        // setting the note, the case "TEST_INITIAL_DELAY amount of time from
        // the anchor timestamp" will bite.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_scheduled_note_immediately_after_scheduling_replacement() {
    let env = TestEnvironment::_new();

    let (_, _, _, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let (replacement_wrapper_note_emission, replacement_note) = env.private_context(|context| {
        let state_var = in_private(context);

        let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

        // We don't use the setup_initialization_then_replacement helper function here, because that
        // function calls `get_scheduled_note` immediately -- which is the very thing we
        // want to test in this test!
        let replacement_wrapper_note_emission = state_var.schedule_replacement(replacement_note);

        (replacement_wrapper_note_emission, replacement_note)
    });

    env.discover_note(replacement_wrapper_note_emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        // Another interesting point: a timestamp_of_change might get baked into
        // a note, and then some time later in the same tx, a lower
        // include_by_timestamp might get set. That's ok -- it just means the
        // timestamp_of_change could technically have been earlier than was
        // baked-in.
        let expected_scheduled_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, replacement_note);
        assert_eq(scheduled_ts, expected_scheduled_ts);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_current_note_just_before_scheduled_replacement_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_note, _, _, _, timestamp_of_change) = setup_initialization_then_replacement(env);

    // Just before scheduled initialization takes effect:
    env.mine_block_at(timestamp_of_change - 1);

    // The context defaults to reading from the latest-mined block as the
    // anchor block.
    env.private_context(|context| {
        let state_var = in_private(context);

        let current_note = state_var.get_current_note();

        // The `replacement_note` does not take effect until the timestamp_of_change.
        assert_eq(current_note, initial_note);

        // When we call get_current_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, the anchor block is only 1 second before
        // the timestamp_of_change, so we'll have 0 seconds until the tx expires.
        // This is clearly not a realistic or valid tx.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = timestamp_of_change - 1;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_note_just_before_scheduled_replacement_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, replacement_note, timestamp_of_change) =
        setup_initialization_then_replacement(env);

    env.mine_block_at(timestamp_of_change - 1);

    // The context defaults to reading from the latest-mined block as the
    // anchor block.
    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, replacement_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // the min of:
        // - TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // - 1 second before the `timestamp_of_change` of the delayed_private_mutable_note.
        // We check that the `include_by_timestamp` has been set accordingly.
        // In the case of this test, the anchor block is only 1 second before
        // the timestamp_of_change, so we'll have 0 seconds until the tx expires.
        // This is clearly not a realistic or valid tx.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = timestamp_of_change - 1;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_note_at_the_time_scheduled_replacement_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, replacement_note, timestamp_of_change) =
        setup_initialization_then_replacement(env);

    env.mine_block_at(timestamp_of_change);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change`.
    env.private_context(|context| {
        let state_var = in_private(context);
        let current_note = state_var.get_current_note();

        assert_eq(current_note, replacement_note);
    })
}

#[test]
unconstrained fn get_scheduled_note_at_the_time_scheduled_replacement_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, replacement_note, timestamp_of_change) =
        setup_initialization_then_replacement(env);

    env.mine_block_at(timestamp_of_change);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change`.
    env.private_context(|context| {
        // Double-check the test env works as expected:
        assert_eq(context.get_anchor_timestamp(), timestamp_of_change);

        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, replacement_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);

        // The scheduled and current notes should align, now that the scheduled
        // note has taken effect:
        let current_note = state_var.get_current_note();
        assert_eq(scheduled_note, current_note);
    })
}

#[test]
unconstrained fn get_current_note_after_scheduled_replacement_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, replacement_note, timestamp_of_change) =
        setup_initialization_then_replacement(env);

    // + 7 is arbitrarily "some time after the expected timestamp of change".
    env.mine_block_at(timestamp_of_change + 7);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change + 7`.
    env.private_context(|context| {
        let state_var = in_private(context);
        let current_note = state_var.get_current_note();

        assert_eq(current_note, replacement_note);
    })
}

#[test]
unconstrained fn get_scheduled_note_after_scheduled_replacement_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, replacement_note, timestamp_of_change) =
        setup_initialization_then_replacement(env);

    // + 7 is arbitrarily "some time after the expected timestamp of change".
    env.mine_block_at(timestamp_of_change + 7);

    // The context defaults to reading from the latest-mined block as the
    // anchor block, so it will have an anchor timestamp of `timestamp_of_change + 7`.
    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();

        assert_eq(scheduled_note, replacement_note);
        assert_eq(scheduled_ts, timestamp_of_change);

        // When we call get_scheduled_note, the returned note is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        // We check that the `include_by_timestamp` has been set accordingly.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);

        // The scheduled and current notes should align, now that the scheduled
        // note has taken effect:
        let current_note = state_var.get_current_note();
        assert_eq(scheduled_note, current_note);
    })
}

/*******************************************************************************
 * UTILITY
 ******************************************************************************/

#[test(should_fail_with = "Attempted to read past end of BoundedVec")]
unconstrained fn view_current_note_uninitialized() {
    let env = TestEnvironment::_new();

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.view_current_note(), zeroed());
    });
}

#[test]
unconstrained fn view_current_note_just_before_scheduled_change() {
    let env = TestEnvironment::_new();

    let (_, _, _, timestamp_of_change) = setup_schedule_initialization(env);

    env.mine_block_at(timestamp_of_change - 1);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change - 1);

        let state_var = in_utility(context);
        assert_eq(state_var.view_current_note(), zeroed());
    });
}

#[test]
unconstrained fn view_current_note_at_scheduled_change() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    env.set_next_block_timestamp(timestamp_of_change);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change);

        let state_var = in_utility(context);
        assert_eq(state_var.view_current_note(), initial_note);
    });
}

#[test]
unconstrained fn view_current_note_after_scheduled_change() {
    let env = TestEnvironment::_new();

    let (_, _, initial_note, timestamp_of_change) = setup_schedule_initialization(env);

    env.set_next_block_timestamp(timestamp_of_change + 10);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change + 10);

        let state_var = in_utility(context);
        assert_eq(state_var.view_current_note(), initial_note);
    });
}

/*******************************************************************************
 * DELAY
 ******************************************************************************/

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn schedule_delay_change_uninitialized() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let _ = state_var.schedule_delay_change(LONGER_DELAY);
    });
}

#[test]
unconstrained fn get_current_delay_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        let current_delay = state_var.get_current_delay();

        assert_eq(current_delay, TEST_INITIAL_DELAY);
    });
}

#[test]
unconstrained fn schedule_delay_increase_before_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, initial_wrapper_note_hash, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Initialization note takes effect in 100s (from the include_by_timestamp).

    // Line-up a _longer_ delay change at 90s (10s before).

    // The initialization note should still take effect at 100s.

    // The delay change should happen immediately, because it's an increase.

    // Arbitrary choice of 10 for "some time before the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change - 10);

    let delay_change_wrapper_note_emission = env.private_context(|context| {
        let state_var = in_private(context);

        let delay_change_wrapper_note_emission = state_var.schedule_delay_change(LONGER_DELAY);

        // During replacement, we nullify the initial note, and emit the replacement note.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        let expected_nullifier =
            initial_wrapper_note.compute_nullifier(context, initial_wrapper_note_hash);

        assert_eq(context.nullifiers.get(0).value, expected_nullifier);

        let delay_change_wrapper_note = delay_change_wrapper_note_emission.note;

        let svc = delay_change_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let note_ts = svc.get_timestamp_of_change();

        // We should inherit the svc of the initial wrapper note.
        assert_eq(svc, initial_wrapper_note.delayed_mutable_values.svc);
        assert_eq(pre_note, MockNote::empty());
        assert_eq(post_note, initial_note);
        assert_eq(note_ts, initial_note_timestamp_of_change);

        let sdc = delay_change_wrapper_note.delayed_mutable_values.sdc;
        let pre_delay = sdc.get_pre();
        let post_delay = sdc.get_post();
        let delay_ts = sdc.get_timestamp_of_change();

        assert_eq(pre_delay.unwrap(), TEST_INITIAL_DELAY);
        assert_eq(post_delay.unwrap(), LONGER_DELAY);
        // The delay should take effect immediately, because it's a longer delay.
        let expected_delay_ts = context.include_by_timestamp;
        assert_eq(delay_ts, expected_delay_ts);

        assert_eq(delay_change_wrapper_note_emission.storage_slot, STORAGE_SLOT);

        delay_change_wrapper_note_emission
    });

    env.discover_note(delay_change_wrapper_note_emission);

    // Double-check we didn't break the initially-scheduled note change from
    // taking effect:
    env.mine_block_at(initial_note_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_note = state_var.get_current_note();

        assert_eq(current_note, initial_note);
    });
}

#[test]
unconstrained fn schedule_delay_increase_after_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, initial_wrapper_note_hash, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Initialization note takes effect in 100s (from the include_by_timestamp).

    // Line-up a _longer_ delay change at 110s (10s after).

    // The delay change should happen immediately, because it's an increase.

    // Arbitrary choice of 10 for "some time after the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change + 10);

    env.private_context(|context| {
        let state_var = in_private(context);

        let delay_change_wrapper_note_emission = state_var.schedule_delay_change(LONGER_DELAY);

        // During replacement, we nullify the initial note, and emit the replacement note.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        let expected_nullifier =
            initial_wrapper_note.compute_nullifier(context, initial_wrapper_note_hash);

        assert_eq(context.nullifiers.get(0).value, expected_nullifier);

        let delay_change_wrapper_note = delay_change_wrapper_note_emission.note;

        let svc = delay_change_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let note_ts = svc.get_timestamp_of_change();

        // We should inherit the svc of the initial wrapper note.
        assert_eq(svc, initial_wrapper_note.delayed_mutable_values.svc);
        assert_eq(pre_note, MockNote::empty());
        assert_eq(post_note, initial_note);
        assert_eq(note_ts, initial_note_timestamp_of_change);

        let sdc = delay_change_wrapper_note.delayed_mutable_values.sdc;
        let pre_delay = sdc.get_pre();
        let post_delay = sdc.get_post();
        let delay_ts = sdc.get_timestamp_of_change();

        assert_eq(pre_delay.unwrap(), TEST_INITIAL_DELAY);
        assert_eq(post_delay.unwrap(), LONGER_DELAY);
        // The delay should take effect immediately, because it's a longer delay.
        let expected_delay_ts = context.include_by_timestamp;
        assert_eq(delay_ts, expected_delay_ts);

        assert_eq(delay_change_wrapper_note_emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn schedule_delay_decrease_before_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, _, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Initialization note takes effect in 100s (from the include_by_timestamp).

    // Line-up a _shorter_ delay change at 90s (10s before)
    // (the delay will change from 100 -> 75)

    // The initialization note should still take effect at 100s.

    // The delay change timestamp of change should be 100 - 75 = 25s from the
    // include-by timestamp of the delay change tx.

    // Arbitrary choice of 10 for "some time before the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change - 10);

    let delay_change_wrapper_note_emission = env.private_context(|context| {
        let state_var = in_private(context);

        let delay_change_wrapper_note_emission = state_var.schedule_delay_change(SHORTER_DELAY);

        let delay_change_wrapper_note = delay_change_wrapper_note_emission.note;

        let svc = delay_change_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let note_ts = svc.get_timestamp_of_change();

        // We should inherit the svc of the initial wrapper note.
        assert_eq(svc, initial_wrapper_note.delayed_mutable_values.svc);
        assert_eq(pre_note, MockNote::empty());
        assert_eq(post_note, initial_note);
        assert_eq(note_ts, initial_note_timestamp_of_change);

        let sdc = delay_change_wrapper_note.delayed_mutable_values.sdc;
        let pre_delay = sdc.get_pre();
        let post_delay = sdc.get_post();
        let delay_ts = sdc.get_timestamp_of_change();

        assert_eq(pre_delay.unwrap(), TEST_INITIAL_DELAY);
        assert_eq(post_delay.unwrap(), SHORTER_DELAY);
        // Since a shorter delay has been set, it will take some time to take effect:
        let expected_delay_ts =
            context.include_by_timestamp + (TEST_INITIAL_DELAY - SHORTER_DELAY);
        assert_eq(delay_ts, expected_delay_ts);

        delay_change_wrapper_note_emission
    });

    env.discover_note(delay_change_wrapper_note_emission);

    // Double-check we didn't break the initially-scheduled note change from
    // taking effect:
    env.mine_block_at(initial_note_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_note = state_var.get_current_note();

        assert_eq(current_note, initial_note);
    });
}

#[test]
unconstrained fn schedule_delay_decrease_after_initial_note_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, initial_wrapper_note_hash, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Initialization note takes effect in 100s (from the include_by_timestamp).

    // Line-up a _shorter_ delay change at 110s (10s after).

    // The delay change timestamp of change should be 100 - 75 = 25s from the
    // include-by timestamp of the delay change tx.

    // Arbitrary choice of 10 for "some time after the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change + 10);

    env.private_context(|context| {
        let state_var = in_private(context);

        let delay_change_wrapper_note_emission = state_var.schedule_delay_change(SHORTER_DELAY);

        // During replacement, we nullify the initial note, and emit the replacement note.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        let expected_nullifier =
            initial_wrapper_note.compute_nullifier(context, initial_wrapper_note_hash);

        assert_eq(context.nullifiers.get(0).value, expected_nullifier);

        let delay_change_wrapper_note = delay_change_wrapper_note_emission.note;

        let svc = delay_change_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let note_ts = svc.get_timestamp_of_change();

        // We should inherit the svc of the initial wrapper note.
        assert_eq(svc, initial_wrapper_note.delayed_mutable_values.svc);
        assert_eq(pre_note, MockNote::empty());
        assert_eq(post_note, initial_note);
        assert_eq(note_ts, initial_note_timestamp_of_change);

        let sdc = delay_change_wrapper_note.delayed_mutable_values.sdc;
        let pre_delay = sdc.get_pre();
        let post_delay = sdc.get_post();
        let delay_ts = sdc.get_timestamp_of_change();

        assert_eq(pre_delay.unwrap(), TEST_INITIAL_DELAY);
        assert_eq(post_delay.unwrap(), SHORTER_DELAY);
        // Since a shorter delay has been set, it will take some time to take effect:
        let expected_delay_ts =
            context.include_by_timestamp + (TEST_INITIAL_DELAY - SHORTER_DELAY);
        assert_eq(delay_ts, expected_delay_ts);
    });
}

#[test]
unconstrained fn schedule_delay_decrease_but_then_schedule_value_change_before_the_former_takes_effect() {
    let env = TestEnvironment::_new();

    let (initial_wrapper_note, _, initial_note, initial_note_timestamp_of_change) =
        setup_schedule_initialization(env);

    // Line-up a _shorter_ delay change.

    // Before that delay takes effect, line up a note change.

    // Arbitrary choice of 10 for "some time after the initial note takes effect"
    env.mine_block_at(initial_note_timestamp_of_change + 10);

    let (delay_change_wrapper_note_emission, delay_change_wrapper_note, delay_ts) = env
        .private_context(|context| {
            let state_var = in_private(context);

            let delay_change_wrapper_note_emission = state_var.schedule_delay_change(SHORTER_DELAY);

            let delay_change_wrapper_note = delay_change_wrapper_note_emission.note;

            let svc = delay_change_wrapper_note.delayed_mutable_values.svc;
            let pre_note = svc.get_pre();
            let post_note = svc.get_post();
            let note_ts = svc.get_timestamp_of_change();

            // We should inherit the svc of the initial wrapper note.
            assert_eq(svc, initial_wrapper_note.delayed_mutable_values.svc);
            assert_eq(pre_note, MockNote::empty());
            assert_eq(post_note, initial_note);
            assert_eq(note_ts, initial_note_timestamp_of_change);

            let sdc = delay_change_wrapper_note.delayed_mutable_values.sdc;
            let pre_delay = sdc.get_pre();
            let post_delay = sdc.get_post();
            let delay_ts = sdc.get_timestamp_of_change();

            assert_eq(pre_delay.unwrap(), TEST_INITIAL_DELAY);
            assert_eq(post_delay.unwrap(), SHORTER_DELAY);
            // Since a shorter delay has been set, it will take some time to take effect:
            let expected_delay_ts =
                context.include_by_timestamp + (TEST_INITIAL_DELAY - SHORTER_DELAY);
            assert_eq(delay_ts, expected_delay_ts);

            (delay_change_wrapper_note_emission, delay_change_wrapper_note, delay_ts)
        });

    env.discover_note(delay_change_wrapper_note_emission);

    // Jump to a time before the new delay takes effect:
    let time_until_delay_change = 10; // 10 is arbitrary
    env.mine_block_at(delay_ts - time_until_delay_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let replacement_note = MockNote::new(REPLACEMENT_VALUE).build_note();

        let replacement_wrapper_note_emission = state_var.schedule_replacement(replacement_note);

        let replacement_wrapper_note = replacement_wrapper_note_emission.note;

        let svc = replacement_wrapper_note.delayed_mutable_values.svc;
        let pre_note = svc.get_pre();
        let post_note = svc.get_post();
        let note_ts = svc.get_timestamp_of_change();

        assert_eq(pre_note, initial_note);
        assert_eq(post_note, replacement_note);

        // The rules for reading before a delay timestamp_of_change are a bit complex.
        // It's the min of:
        // - time until delay change + post_delay - 1
        // - pre delay
        // Since we shortened the delay, the first one will bite, because
        // when shortening, time_until_delay_change is initially set to
        // pre_delay - post_delay seconds in the future. We're further into the
        // future now, so there's less time until the delay change.
        // The time until the delay change must be relative to the `include_by_timestamp`,
        // just in case the tx is included at the very last valid moment; we
        // still need to give users sufficient delay time.
        let expected_note_ts =
            context.include_by_timestamp + time_until_delay_change + SHORTER_DELAY - 1;
        assert_eq(note_ts, expected_note_ts);

        let sdc = replacement_wrapper_note.delayed_mutable_values.sdc;
        // We should inherit the sdc of the delay change wrapper note.
        assert_eq(sdc, delay_change_wrapper_note.delayed_mutable_values.sdc);
    });
}

// Note: We can't create a test (similar to the one directly above ^^^) to
// schedule a delay INCREASE and then schedule a note change before the former
// takes effect, because a scheduled delay INCREASE takes effect immediately.

#[test]
unconstrained fn get_current_delay_immediately_after_scheduling_delay_increase() {
    let env = TestEnvironment::_new();

    let (_, _, _, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let delay_change_wrapper_note_emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.schedule_delay_change(LONGER_DELAY)
    });

    env.discover_note(delay_change_wrapper_note_emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        // The delay_change does not take effect until the include_by_timestamp
        assert_eq(current_delay, TEST_INITIAL_DELAY);

        // When we call get_current_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (time until the scheduled change is included - 1) + post delay (200)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_current_delay_immediately_after_scheduling_delay_decrease() {
    let env = TestEnvironment::_new();

    let (_, _, _, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    let delay_change_wrapper_note_emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.schedule_delay_change(LONGER_DELAY)
    });

    env.discover_note(delay_change_wrapper_note_emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        // The delay_change does not take effect until the include_by_timestamp
        assert_eq(current_delay, TEST_INITIAL_DELAY);

        // When we call get_current_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (time until the scheduled change is included + (100 - 75) - 1) + post delay (75)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_scheduled_delay_immediately_after_scheduling_delay_increase() {
    let env = TestEnvironment::_new();

    let (_, _, _, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    env.private_context(|context| {
        let state_var = in_private(context);

        // We don't use the setup_initialization_then_delay_change helper function here, because that
        // function calls `get_scheduled_delay` immediately -- which is the very thing we
        // want to test in this test!
        let _ = state_var.schedule_delay_change(LONGER_DELAY);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        // Since we're INCREASING the delay, the change can happen asap, which is
        // the latest time of inclusion of the tx.
        let expected_scheduled_ts = context.include_by_timestamp;

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, LONGER_DELAY);
        assert_eq(scheduled_ts, expected_scheduled_ts);

        // When we call get_scheduled_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (time until the scheduled change is included - 1) + post delay (200)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_scheduled_delay_immediately_after_scheduling_delay_decrease() {
    let env = TestEnvironment::_new();

    let (_, _, _, initial_note_timestamp_of_change) = setup_schedule_initialization(env);

    // 1000 is arbitrary
    env.mine_block_at(initial_note_timestamp_of_change + 1000);

    env.private_context(|context| {
        let state_var = in_private(context);

        // We don't use the setup_initialization_then_delay_change helper function here, because that
        // function calls `get_scheduled_delay` immediately -- which is the very thing we
        // want to test in this test!
        let _ = state_var.schedule_delay_change(SHORTER_DELAY);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        // Since we're DECREASING the delay, and we only just decreased it this second,
        // we must wait TEST_INITIAL_DELAY - SHORTER_DELAY amount of time before it takes effect.
        let expected_scheduled_ts =
            context.include_by_timestamp + (TEST_INITIAL_DELAY - SHORTER_DELAY);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, SHORTER_DELAY);
        assert_eq(scheduled_ts, expected_scheduled_ts);

        // When we call get_current_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (time until the scheduled change is included + (100 - 75) - 1) + post delay (75)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;

        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get)
    });
}

#[test]
unconstrained fn get_current_delay_just_before_scheduled_delay_increase_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    // Just before scheduled initialization takes effect:
    env.mine_block_at(delay_change_timestamp_of_change - 1);

    // The context defaults to reading from the latest-mined block as the
    // anchor block.
    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        // The delay change does not take effect until the delay_change_timestamp_of_change.
        assert_eq(current_delay, TEST_INITIAL_DELAY);

        // When we call get_current_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (0) + post delay (200)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + current_delay;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_delay_just_before_scheduled_delay_decrease_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    // Just before scheduled initialization takes effect:
    env.mine_block_at(delay_change_timestamp_of_change - 1);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        // The delay change does not take effect until the delay_change_timestamp_of_change.
        assert_eq(current_delay, TEST_INITIAL_DELAY);

        // When we call get_current_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (0) + post delay (75)
        // So 75 bites.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + SHORTER_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_delay_just_before_scheduled_delay_increase_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change - 1);

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, LONGER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);

        // When we call get_scheduled_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (0) + post delay (200)
        // So 100 bites.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + TEST_INITIAL_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_delay_just_before_scheduled_delay_decrease_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change - 1);

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, SHORTER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);

        // When we call get_scheduled_delay, the returned note is only valid for
        // the min of:
        // - pre delay (100)
        // - time until just before the change (0) + post delay (75)
        // So 75 bites.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + SHORTER_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_delay_at_the_time_scheduled_delay_increase_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        assert_eq(current_delay, LONGER_DELAY);

        // Should be valid for as long as the new delay that's just taken effect.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + current_delay;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_delay_at_the_time_scheduled_delay_decrease_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        assert_eq(current_delay, SHORTER_DELAY);

        // Should be valid for as long as the new delay that's just taken effect.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + current_delay;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_delay_at_the_time_scheduled_delay_increase_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, LONGER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);

        // Should be valid for as long as the new delay that's just taken effect.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + LONGER_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_scheduled_delay_at_the_time_scheduled_delay_decrease_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change);

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, SHORTER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);

        // Should be valid for as long as the new delay that's just taken effect.
        let include_by_ts_after_get = context.include_by_timestamp;
        let expected_include_by_ts_after_get = context.get_anchor_timestamp() + SHORTER_DELAY;

        assert_eq(include_by_ts_after_get, expected_include_by_ts_after_get);
    })
}

#[test]
unconstrained fn get_current_delay_after_scheduled_delay_increase_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change + 10); // 10 is arbitrary

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        assert_eq(current_delay, LONGER_DELAY);
    })
}

#[test]
unconstrained fn get_current_delay_after_scheduled_delay_decrease_takes_effect() {
    let env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change + 10); // 10 is arbitrary

    env.private_context(|context| {
        let state_var = in_private(context);

        let current_delay = state_var.get_current_delay();

        assert_eq(current_delay, SHORTER_DELAY);
    })
}

#[test]
unconstrained fn get_scheduled_delay_after_scheduled_delay_increase_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, LONGER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change + 10); // 10 is arbitrary

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, LONGER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);
    })
}

#[test]
unconstrained fn get_scheduled_delay_after_scheduled_delay_decrease_takes_effect() {
    let mut env = TestEnvironment::_new();

    let (_, _, _, delay_change_timestamp_of_change) =
        setup_initialization_then_delay_change(env, SHORTER_DELAY);

    env.mine_block_at(delay_change_timestamp_of_change + 10); // 10 is arbitrary

    env.private_context(|context| {
        let state_var = in_private(context);

        let (scheduled_delay, scheduled_ts) = state_var.get_scheduled_delay();

        assert_eq(scheduled_delay, SHORTER_DELAY);
        assert_eq(scheduled_ts, delay_change_timestamp_of_change);
    })
}
