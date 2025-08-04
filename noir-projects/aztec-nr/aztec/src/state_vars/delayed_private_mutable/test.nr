use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    oracle::execution::get_contract_address,
    state_vars::delayed_private_mutable::DelayedPrivateMutable,
    test::{
        helpers::test_environment::TestEnvironment,
        mocks::{mock_note::{MockNote, MockNoteBuilder}, mock_struct::MockStruct},
    },
};

use std::test::OracleMock;

use protocol_types::{
    address::AztecAddress,
    delayed_public_mutable::scheduled_delay_change::ScheduledDelayChange,
    traits::{Empty, Packable},
};

use dep::std::mem::zeroed;

global STORAGE_SLOT: Field = 47;

global INITIAL_VALUE: Field = 17;
global NEW_VALUE: Field = 18;

global TEST_INITIAL_DELAY: u64 = 100;

global new_delay: u64 = 20;
// global new_value: MockStruct = MockStruct { a: 17, b: 42 };
// global new_note = MockNote::new(17).build_note();
// global new_note = MockNote { value: 17 };

unconstrained fn in_public(
    context: &mut PublicContext,
) -> DelayedPrivateMutable<MockNote, TEST_INITIAL_DELAY, &mut PublicContext> {
    DelayedPrivateMutable::new(context, STORAGE_SLOT)
}

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

// First, a collection of tests that are modifications of those for PrivateMutable:
#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_uninitialized() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.get_current_note();
    });
}

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
unconstrained fn schedule_initialization() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let emission = state_var.schedule_initialization(note);

        // During initialization we both create the new note and emit the initialization nullifier
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(context.nullifiers.get(0).value, state_var.compute_initialization_nullifier());

        let wrapper_note = emission.note;

        let svc = wrapper_note.delayed_mutable_values.svc;
        let pre = svc.get_pre();
        let post = svc.get_post();
        let ts = svc.get_timestamp_of_change();

        assert_eq(pre, MockNote::empty());
        assert_eq(post, note);

        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;
        assert_eq(ts, expected_ts);

        let sdc = wrapper_note.delayed_mutable_values.sdc;
        assert_eq(sdc, ScheduledDelayChange::<TEST_INITIAL_DELAY>::empty());

        assert_eq(emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn get_current_note_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        let current_note = state_var.get_current_note();

        assert_eq(current_note, MockNote::empty());
    });
}

#[test]
unconstrained fn get_scheduled_note_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;

        // When we perform a read at this moment in time, it is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();
        let include_by_ts_after = context.include_by_timestamp;

        let anchor_ts = context.get_anchor_timestamp();
        let expected_include_by_ts_after = anchor_ts + TEST_INITIAL_DELAY;

        assert_eq(note, scheduled_note);
        assert_eq(scheduled_ts, expected_ts);
        assert_eq(include_by_ts_after, expected_include_by_ts_after)
    });
}

#[test]
unconstrained fn get_current_note_at_the_time_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    let (scheduled_note, timestamp_of_change) = env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        state_var.get_scheduled_note()
    });

    env.set_next_block_timestamp(timestamp_of_change);

    // TODO: we need note discovery for this to work.
    env.private_context(|context| {
        let state_var = in_private(context);
        let current_note = state_var.get_current_note();
        assert_eq(current_note, scheduled_note);
    })
}

#[test]
unconstrained fn get_scheduled_note_at_the_time_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        // Note: we have to compute the expected_ts _before_ we get_scheduled_note, because the
        // act of getting the scheduled note will mutate the `context.include_by_timestamp`.
        let expected_ts = context.include_by_timestamp + TEST_INITIAL_DELAY;

        // When we perform a read at this moment in time, it is only valid for
        // TEST_INITIAL_DELAY amount of time from the anchor timestamp.
        let (scheduled_note, scheduled_ts) = state_var.get_scheduled_note();
        let include_by_ts_after = context.include_by_timestamp;

        let anchor_ts = context.get_anchor_timestamp();
        let expected_include_by_ts_after = anchor_ts + TEST_INITIAL_DELAY;

        assert_eq(note, scheduled_note);
        assert_eq(scheduled_ts, expected_ts);
        assert_eq(include_by_ts_after, expected_include_by_ts_after)
    });
}

// DELAY

#[test]
unconstrained fn get_current_delay_before_scheduled_initialization_takes_effect() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(INITIAL_VALUE).build_note();

        let _ = state_var.schedule_initialization(note);

        let current_delay = state_var.get_current_delay();

        assert_eq(TEST_INITIAL_DELAY, current_delay);
    });
}
