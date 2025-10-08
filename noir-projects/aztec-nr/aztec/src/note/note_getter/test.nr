use crate::note::{
    note_getter::constrain_get_notes_internal,
    note_getter_options::{NoteGetterOptions, PropertySelector, SortOrder},
};
use protocol_types::address::AztecAddress;

use crate::note::retrieved_note::RetrievedNote;
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};
use crate::utils::comparison::Comparator;

global storage_slot: Field = 42;

unconstrained fn build_valid_retrieved_note(
    contract_address: AztecAddress,
    value: Field,
) -> RetrievedNote<MockNote> {
    MockNote::new(value).contract_address(contract_address).build_retrieved_note()
}

unconstrained fn assert_equivalent_vec_and_array<T, let N: u32>(
    vec: BoundedVec<T, N>,
    arr: [Option<T>; N],
)
where
    T: Eq,
{
    let mut count = 0;

    for i in 0..N {
        if arr[i].is_some() {
            assert_eq(arr[i].unwrap(), vec.get(count));
            count += 1;
        }
    }

    assert_eq(count, vec.len());
}

#[test]
unconstrained fn constrain_get_notes_processes_single_note() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let mut notes_to_constrain = [Option::none(); _];
        notes_to_constrain[0] =
            Option::some(build_valid_retrieved_note(context.this_address(), 13));

        let options = NoteGetterOptions::new();
        let (returned, _) =
            constrain_get_notes_internal(context, storage_slot, notes_to_constrain, options);

        assert_equivalent_vec_and_array(returned, notes_to_constrain);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test]
unconstrained fn constrain_get_notes_processes_many_notes() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();

        let mut notes_to_constrain = [Option::none(); _];
        notes_to_constrain[0] = Option::some(build_valid_retrieved_note(contract_address, 13));
        notes_to_constrain[1] = Option::some(build_valid_retrieved_note(contract_address, 19));

        let options = NoteGetterOptions::new();
        let (returned, _) =
            constrain_get_notes_internal(context, storage_slot, notes_to_constrain, options);

        assert_equivalent_vec_and_array(returned, notes_to_constrain);
        assert_eq(context.note_hash_read_requests.len(), 2);
    });
}

#[test]
unconstrained fn constrain_get_notes_collapses_notes_at_the_beginning_of_the_array() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];

        opt_notes[1] = Option::some(build_valid_retrieved_note(contract_address, 0));
        opt_notes[2] = Option::some(build_valid_retrieved_note(contract_address, 1));
        opt_notes[3] = Option::some(build_valid_retrieved_note(contract_address, 2));
        opt_notes[5] = Option::some(build_valid_retrieved_note(contract_address, 3));
        opt_notes[8] = Option::some(build_valid_retrieved_note(contract_address, 4));
        opt_notes[13] = Option::some(build_valid_retrieved_note(contract_address, 5));

        let options = NoteGetterOptions::new();
        let (returned, _) =
            constrain_get_notes_internal(context, storage_slot, opt_notes, options);

        let mut expected = [Option::none(); _];
        expected[0] = Option::some(build_valid_retrieved_note(contract_address, 0));
        expected[1] = Option::some(build_valid_retrieved_note(contract_address, 1));
        expected[2] = Option::some(build_valid_retrieved_note(contract_address, 2));
        expected[3] = Option::some(build_valid_retrieved_note(contract_address, 3));
        expected[4] = Option::some(build_valid_retrieved_note(contract_address, 4));
        expected[5] = Option::some(build_valid_retrieved_note(contract_address, 5));

        assert_equivalent_vec_and_array(returned, expected);
    });
}

#[test]
unconstrained fn constrain_get_notes_can_return_zero_notes() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let opt_notes: [Option<RetrievedNote<MockNote>>; _] = [Option::none(); _];

        let options = NoteGetterOptions::new();
        let (returned, _) =
            constrain_get_notes_internal(context, storage_slot, opt_notes, options);
        assert_eq(returned.len(), 0);
    });
}

#[test(should_fail_with = "Got more notes than limit.")]
unconstrained fn constrain_get_notes_rejects_mote_notes_than_limit() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes: [Option<RetrievedNote<MockNote>>; _] = [Option::none(); _];

        opt_notes[1] = Option::some(build_valid_retrieved_note(contract_address, 0));
        opt_notes[2] = Option::some(build_valid_retrieved_note(contract_address, 1));
        opt_notes[3] = Option::some(build_valid_retrieved_note(contract_address, 2));

        let mut options = NoteGetterOptions::new();
        options = options.set_limit(2);
        let _ = constrain_get_notes_internal(context, storage_slot, opt_notes, options);
    });
}

#[test]
unconstrained fn constrain_get_notes_applies_filter_before_constraining() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut notes_to_constrain = [Option::none(); _];
        let invalid_note = MockNote::new(13).build_retrieved_note(); // This note does not have the correct address or storage slot
        notes_to_constrain[0] = Option::some(invalid_note);
        notes_to_constrain[1] = Option::some(build_valid_retrieved_note(contract_address, 42));

        let filter_fn = |opt_notes: [Option<RetrievedNote<MockNote>>; _], _| {
            let mut selected = [Option::none(); _];

            for i in 0..opt_notes.len() {
                // This will filter the notes so that only the valid one remains
                if opt_notes[i].is_some() & (opt_notes[i].unwrap_unchecked().note.value == 42) {
                    selected[i] = opt_notes[i];
                }
            }
            selected
        };

        let options = NoteGetterOptions::with_filter(filter_fn, ());
        let (returned, _) =
            constrain_get_notes_internal(context, storage_slot, notes_to_constrain, options);

        // Only the note with value 42 should be returned, and moved to the beginning of the array. The other notes were not
        // constrained, and hence validation did not fail.
        let mut expected = [Option::none(); _];
        expected[0] = Option::some(build_valid_retrieved_note(contract_address, 42));

        assert_equivalent_vec_and_array(returned, expected);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test(should_fail_with = "Note contract address mismatch.")]
unconstrained fn constrain_get_notes_rejects_mismatched_address() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let note = MockNote::new(1).build_retrieved_note(); // We're not setting the right contract address
        let mut opt_notes = [Option::none(); _];
        opt_notes[0] = Option::some(note);

        let mut options = NoteGetterOptions::new();
        let _ = constrain_get_notes_internal(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Mismatch return note field.")]
unconstrained fn constrain_get_notes_rejects_mismatched_selector() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let value = 10;
        let note = build_valid_retrieved_note(context.this_address(), value);

        let mut opt_notes = [Option::none(); _];
        opt_notes[0] = Option::some(note);

        let mut options = NoteGetterOptions::new();
        options = options.select(
            PropertySelector { index: 0, offset: 0, length: 32 },
            Comparator.EQ,
            value + 1,
        );

        let _ = constrain_get_notes_internal(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Return notes not sorted in descending order.")]
unconstrained fn constrain_get_notes_rejects_mismatched_desc_sort_order() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];
        // Notes in ascending order
        opt_notes[0] = Option::some(build_valid_retrieved_note(contract_address, 1));
        opt_notes[1] = Option::some(build_valid_retrieved_note(contract_address, 2));

        let mut options = NoteGetterOptions::new();
        options =
            options.sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.DESC);
        let _ = constrain_get_notes_internal(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Return notes not sorted in ascending order.")]
unconstrained fn constrain_get_notes_rejects_mismatched_asc_sort_order() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];
        // Notes in descending order
        opt_notes[0] = Option::some(build_valid_retrieved_note(contract_address, 2));
        opt_notes[1] = Option::some(build_valid_retrieved_note(contract_address, 1));

        let mut options = NoteGetterOptions::new();
        options =
            options.sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC);
        let _ = constrain_get_notes_internal(context, storage_slot, opt_notes, options);
    });
}
