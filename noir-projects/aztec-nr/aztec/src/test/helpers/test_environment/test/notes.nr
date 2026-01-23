use crate::note::{
    lifecycle::{create_note, destroy_note},
    note_getter::{get_note, get_notes, view_note, view_notes},
    note_getter_options::NoteGetterOptions,
    note_viewer_options::NoteViewerOptions,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};
use protocol_types::{address::AztecAddress, traits::FromField};

global VALUE: Field = 7;
global CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(12);
global OWNER: AztecAddress = AztecAddress::from_field(50);
global STORAGE_SLOT: Field = 13;

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_nonexistent_note_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_nonexistent_note_fails() {
    let env = TestEnvironment::new();

    env.private_context(|_| { let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT); });
}

#[test]
unconstrained fn get_transient_note() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let note = MockNote::new(VALUE).build_note();
        let _ = create_note(context, OWNER, STORAGE_SLOT, note);
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);

        assert_eq(confirmed_note.note, note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_undiscovered_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    env.private_context(|context| { let _ = create_note(context, OWNER, STORAGE_SLOT, note); });

    env.private_context(|context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_undiscovered_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    env.private_context(|context| { let _ = create_note(context, OWNER, STORAGE_SLOT, note); });

    env.utility_context(|_| { let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT); });
}

#[test]
unconstrained fn get_discovered_settled_note() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.private_context(|context| {
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);

        assert_eq(confirmed_note.note, note);
    });
}

#[test]
unconstrained fn view_discovered_settled_note() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.utility_context(|_| {
        let confirmed_note = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT);

        assert_eq(confirmed_note.note, note);
    });
}

#[test]
unconstrained fn get_multiple_discovered_settled_notes() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();
    let other_note = MockNote::new(VALUE + 1).build_note();

    let (note_message, other_note_message) = env.private_context(|context| {
        (
            create_note(context, OWNER, STORAGE_SLOT, note),
            create_note(context, OWNER, STORAGE_SLOT, other_note),
        )
    });

    env.discover_note(note_message);
    env.discover_note(other_note_message);

    env.private_context(|context| {
        let options = NoteGetterOptions::new().set_owner(OWNER);
        let notes = get_notes(context, STORAGE_SLOT, options);

        assert_eq(notes.len(), 2);
        assert_eq(notes.get(0).note, note);
        assert_eq(notes.get(1).note, other_note);
    });
}

#[test]
unconstrained fn view_multiple_discovered_settled_notes() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();
    let other_note = MockNote::new(VALUE + 1).build_note();

    let (note_message, other_note_message) = env.private_context(|context| {
        (
            create_note(context, OWNER, STORAGE_SLOT, note),
            create_note(context, OWNER, STORAGE_SLOT, other_note),
        )
    });

    env.discover_note(note_message);
    env.discover_note(other_note_message);

    env.utility_context(|_| {
        let options = NoteViewerOptions::new().set_owner(OWNER);
        let notes = view_notes(STORAGE_SLOT, options);

        assert_eq(notes.len(), 2);
        assert_eq(notes.get(0), note);
        assert_eq(notes.get(1), other_note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_at_other_contract_discovered_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_at_other_contract_discovered_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.utility_context_at(CONTRACT_ADDRESS, |_| {
        let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_discovered_at_other_contract_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note_at(CONTRACT_ADDRESS, note_message);

    env.private_context(|context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_discovered_at_other_contract_settled_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note_at(CONTRACT_ADDRESS, note_message);

    env.utility_context(|_| { let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT); });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_discovered_settled_note_at_other_contract_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, OWNER, STORAGE_SLOT, note)
    });

    env.discover_note(note_message);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_discovered_settled_note_at_other_contract_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, OWNER, STORAGE_SLOT, note)
    });

    env.discover_note(note_message);

    env.utility_context_at(CONTRACT_ADDRESS, |_| {
        let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test]
unconstrained fn get_discovered_at_other_contract_settled_note_at_other_contract() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, OWNER, STORAGE_SLOT, note)
    });

    env.discover_note_at(CONTRACT_ADDRESS, note_message);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);

        assert_eq(confirmed_note.note, note);
    });
}

#[test]
unconstrained fn view_discovered_at_other_contract_settled_note_at_other_contract() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, OWNER, STORAGE_SLOT, note)
    });

    env.discover_note_at(CONTRACT_ADDRESS, note_message);

    env.utility_context_at(CONTRACT_ADDRESS, |_| {
        let confirmed_note = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT);

        assert_eq(confirmed_note.note, note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_squashed_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    env.private_context(|context| {
        let _ = create_note(context, OWNER, STORAGE_SLOT, note);

        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);

        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_settled_squashed_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let note_message = create_note(context, OWNER, STORAGE_SLOT, note);

        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);

        note_message
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_settled_squashed_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let note_message = create_note(context, OWNER, STORAGE_SLOT, note);

        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);

        note_message
    });

    env.discover_note(note_message);

    env.utility_context(|_| { let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT); });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_settled_note_with_transient_nullifier_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.private_context(|context| {
        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);

        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_settled_note_with_settled_nullifier_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.private_context(|context| {
        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);
    });

    env.private_context(|context| {
        let _ = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_settled_note_with_settled_nullifier_note_fails() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let note_message =
        env.private_context(|context| create_note(context, OWNER, STORAGE_SLOT, note));

    env.discover_note(note_message);

    env.private_context(|context| {
        // The aztec-nr API makes it so that in order to destroy the note we need to read it, because we need to know
        // its note hash (either transient or settled). Conceptually this also forces the application to prove that the
        // note does exist, and that it's not simply emitting a random nullifier.
        let confirmed_note = get_note::<MockNote>(context, Option::some(OWNER), STORAGE_SLOT);
        destroy_note(context, confirmed_note);
    });

    env.utility_context(|_| { let _ = view_note::<MockNote>(Option::some(OWNER), STORAGE_SLOT); });
}
