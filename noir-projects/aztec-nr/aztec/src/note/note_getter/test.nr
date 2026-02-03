use crate::{
    note::{
        ConfirmedNote,
        HintedNote,
        note_getter::{confirm_hinted_note, confirm_hinted_notes},
        note_getter_options::{NoteGetterOptions, PropertySelector, SortOrder},
    },
    oracle::random::random,
    test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote},
    utils::comparison::Comparator,
};

use crate::protocol::{address::AztecAddress, traits::FromField};

global storage_slot: Field = 42;
global owner: AztecAddress = AztecAddress::from_field(50);

unconstrained fn build_valid_hinted_note(contract_address: AztecAddress, value: Field) -> HintedNote<MockNote> {
    MockNote::new(value).contract_address(contract_address).owner(owner).storage_slot(storage_slot).build_hinted_note()
}

unconstrained fn assert_equivalent_vec_and_array<T, let N: u32>(vec: BoundedVec<T, N>, arr: [Option<T>; N])
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

unconstrained fn confirmed_to_hinted<Note>(confirmed: ConfirmedNote<Note>) -> HintedNote<Note> {
    HintedNote {
        note: confirmed.note,
        contract_address: confirmed.contract_address,
        owner: confirmed.owner,
        randomness: confirmed.randomness,
        storage_slot: confirmed.storage_slot,
        metadata: confirmed.metadata,
    }
}

#[test]
unconstrained fn confirm_notes_processes_single_note() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let mut notes_to_constrain = [Option::none(); _];
        notes_to_constrain[0] = Option::some(build_valid_hinted_note(context.this_address(), 13));

        let options = NoteGetterOptions::new().set_owner(owner);
        let confirmed = confirm_hinted_notes(context, storage_slot, notes_to_constrain, options);

        assert_equivalent_vec_and_array(confirmed.map(confirmed_to_hinted), notes_to_constrain);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test]
unconstrained fn confirm_notes_processes_many_notes() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();

        let mut notes_to_constrain = [Option::none(); _];
        notes_to_constrain[0] = Option::some(build_valid_hinted_note(contract_address, 13));
        notes_to_constrain[1] = Option::some(build_valid_hinted_note(contract_address, 19));

        let options = NoteGetterOptions::new().set_owner(owner);
        let confirmed = confirm_hinted_notes(context, storage_slot, notes_to_constrain, options);

        assert_equivalent_vec_and_array(confirmed.map(confirmed_to_hinted), notes_to_constrain);
        assert_eq(context.note_hash_read_requests.len(), 2);
    });
}

#[test]
unconstrained fn confirm_notes_collapses_notes_at_the_beginning_of_the_array() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];

        opt_notes[1] = Option::some(build_valid_hinted_note(contract_address, 0));
        opt_notes[2] = Option::some(build_valid_hinted_note(contract_address, 1));
        opt_notes[3] = Option::some(build_valid_hinted_note(contract_address, 2));
        opt_notes[5] = Option::some(build_valid_hinted_note(contract_address, 3));
        opt_notes[8] = Option::some(build_valid_hinted_note(contract_address, 4));
        opt_notes[13] = Option::some(build_valid_hinted_note(contract_address, 5));

        let options = NoteGetterOptions::new().set_owner(owner);
        let confirmed = confirm_hinted_notes(context, storage_slot, opt_notes, options);

        let mut expected = [Option::none(); _];
        expected[0] = Option::some(build_valid_hinted_note(contract_address, 0));
        expected[1] = Option::some(build_valid_hinted_note(contract_address, 1));
        expected[2] = Option::some(build_valid_hinted_note(contract_address, 2));
        expected[3] = Option::some(build_valid_hinted_note(contract_address, 3));
        expected[4] = Option::some(build_valid_hinted_note(contract_address, 4));
        expected[5] = Option::some(build_valid_hinted_note(contract_address, 5));

        assert_equivalent_vec_and_array(confirmed.map(confirmed_to_hinted), expected);
    });
}

#[test]
unconstrained fn confirm_notes_can_return_zero_notes() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let opt_notes: [Option<HintedNote<MockNote>>; _] = [Option::none(); _];

        let options = NoteGetterOptions::new().set_owner(owner);
        let confirmed = confirm_hinted_notes(context, storage_slot, opt_notes, options);
        assert_eq(confirmed.len(), 0);
    });
}

#[test(should_fail_with = "Got more notes than limit.")]
unconstrained fn confirm_notes_rejects_mote_notes_than_limit() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes: [Option<HintedNote<MockNote>>; _] = [Option::none(); _];

        opt_notes[1] = Option::some(build_valid_hinted_note(contract_address, 0));
        opt_notes[2] = Option::some(build_valid_hinted_note(contract_address, 1));
        opt_notes[3] = Option::some(build_valid_hinted_note(contract_address, 2));

        let options = NoteGetterOptions::new().set_limit(2).set_owner(owner);
        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test]
unconstrained fn confirm_notes_applies_filter_before_constraining() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut notes_to_constrain = [Option::none(); _];
        let invalid_note = MockNote::new(13).build_hinted_note(); // This note does not have the correct address or
        // storage slot
        notes_to_constrain[0] = Option::some(invalid_note);
        notes_to_constrain[1] = Option::some(build_valid_hinted_note(contract_address, 42));

        let filter_fn = |opt_notes: [Option<HintedNote<MockNote>>; _], _| {
            let mut selected = [Option::none(); _];

            for i in 0..opt_notes.len() {
                // This will filter the notes so that only the valid one remains
                if opt_notes[i].is_some() & (opt_notes[i].unwrap_unchecked().note.value == 42) {
                    selected[i] = opt_notes[i];
                }
            }
            selected
        };

        let options = NoteGetterOptions::with_filter(filter_fn, ()).set_owner(owner);
        let confirmed = confirm_hinted_notes(context, storage_slot, notes_to_constrain, options);

        // Only the note with value 42 should be returned, and moved to the beginning of the array. The other notes
        // were not constrained, and hence validation did not fail.
        let mut expected = [Option::none(); _];
        expected[0] = Option::some(build_valid_hinted_note(contract_address, 42));

        assert_equivalent_vec_and_array(confirmed.map(confirmed_to_hinted), expected);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test(should_fail_with = "Note contract address mismatch.")]
unconstrained fn confirm_notes_rejects_mismatched_address() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let note = MockNote::new(1).build_hinted_note(); // We're not setting the right contract address
        let mut opt_notes = [Option::none(); _];
        opt_notes[0] = Option::some(note);

        let options = NoteGetterOptions::new().set_owner(owner);
        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Note owner mismatch.")]
unconstrained fn confirm_notes_rejects_mismatched_owner() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let different_owner = AztecAddress::from_field(random());
        let note =
            MockNote::new(1).contract_address(context.this_address()).owner(different_owner).build_hinted_note();
        let mut opt_notes = [Option::none(); _];
        opt_notes[0] = Option::some(note);

        let options = NoteGetterOptions::new().set_owner(owner);
        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Mismatch return note field.")]
unconstrained fn confirm_notes_rejects_mismatched_selector() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let value = 10;
        let note = build_valid_hinted_note(context.this_address(), value);

        let mut opt_notes = [Option::none(); _];
        opt_notes[0] = Option::some(note);

        let options = NoteGetterOptions::new().set_owner(owner).select(
            PropertySelector { index: 0, offset: 0, length: 32 },
            Comparator.EQ,
            value + 1,
        );

        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Return notes not sorted in descending order.")]
unconstrained fn confirm_notes_rejects_mismatched_desc_sort_order() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];
        // Notes in ascending order
        opt_notes[0] = Option::some(build_valid_hinted_note(contract_address, 1));
        opt_notes[1] = Option::some(build_valid_hinted_note(contract_address, 2));

        let options = NoteGetterOptions::new()
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.DESC)
            .set_owner(owner);
        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test(should_fail_with = "Return notes not sorted in ascending order.")]
unconstrained fn confirm_notes_rejects_mismatched_asc_sort_order() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let mut opt_notes = [Option::none(); _];
        // Notes in descending order
        opt_notes[0] = Option::some(build_valid_hinted_note(contract_address, 2));
        opt_notes[1] = Option::some(build_valid_hinted_note(contract_address, 1));

        let options = NoteGetterOptions::new()
            .sort(PropertySelector { index: 0, offset: 0, length: 32 }, SortOrder.ASC)
            .set_owner(owner);
        let _ = confirm_hinted_notes(context, storage_slot, opt_notes, options);
    });
}

#[test]
unconstrained fn constrain_view_note_processes_valid_note() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        let note = build_valid_hinted_note(contract_address, 13);

        let confirmed_note = confirm_hinted_note(context, note, Option::some(owner), storage_slot);

        assert_eq(confirmed_note.note.value, 13);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test]
unconstrained fn constrain_view_note_processes_valid_note_when_not_filtering_by_owner() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        // it doesn't matter what owner is in the following note as in the call to constrain_view_note we don't set the
        // owner.
        let note = build_valid_hinted_note(contract_address, 13);

        let confirmed_note = confirm_hinted_note(context, note, Option::none(), storage_slot);

        assert_eq(confirmed_note.note.value, 13);
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test(should_fail_with = "Note contract address mismatch.")]
unconstrained fn constrain_view_note_rejects_mismatched_address() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        // Create a note with a different contract address than the one in the context.
        let different_address = AztecAddress::from_field(random());
        let note = MockNote::new(1).contract_address(different_address).owner(owner).build_hinted_note();

        let _ = confirm_hinted_note(context, note, Option::some(owner), storage_slot);
    });
}

#[test(should_fail_with = "Note owner mismatch.")]
unconstrained fn constrain_view_note_rejects_mismatched_owner() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let contract_address = context.this_address();
        // Create a note with a different owner than the one in the context.
        let different_owner = AztecAddress::from_field(random());
        let note = MockNote::new(1).contract_address(contract_address).owner(different_owner).build_hinted_note();

        let _ = confirm_hinted_note(context, note, Option::some(owner), storage_slot);
    });
}
