use crate::note::{
    lifecycle::create_note,
    note_getter::{get_note, get_notes},
    note_getter_options::NoteGetterOptions,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};
use protocol_types::{address::AztecAddress, traits::FromField};

global VALUE: Field = 7;
global CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(12);
global STORAGE_SLOT: Field = 13;

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_nonexistent_note_fails() {
    let env = TestEnvironment::_new();

    env.private_context(|context| { let _ = get_note::<MockNote>(context, STORAGE_SLOT); });
}

#[test]
unconstrained fn get_transient_note() {
    let env = TestEnvironment::_new();

    env.private_context(|context| {
        let note = MockNote::new(VALUE).build_note();
        let _ = create_note(context, STORAGE_SLOT, note);
        let (retrieved_note, _) = get_note::<MockNote>(context, STORAGE_SLOT);

        assert_eq(retrieved_note.note, note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_undiscovered_settled_note_fails() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    env.private_context(|context| { let _ = create_note(context, STORAGE_SLOT, note); });

    env.private_context(|context| { let _ = get_note::<MockNote>(context, STORAGE_SLOT); });
}

#[test]
unconstrained fn get_discovered_settled_note() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| create_note(context, STORAGE_SLOT, note));

    env.discover_note(emission);

    env.private_context(|context| {
        let (retrieved_note, _) = get_note::<MockNote>(context, STORAGE_SLOT);

        assert_eq(retrieved_note.note, note);
    });
}

#[test]
unconstrained fn get_multiple_discovered_settled_notes() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();
    let other_note = MockNote::new(VALUE + 1).build_note();

    let (emission, other_emission) = env.private_context(|context| {
        (create_note(context, STORAGE_SLOT, note), create_note(context, STORAGE_SLOT, other_note))
    });

    env.discover_note(emission);
    env.discover_note(other_emission);

    env.private_context(|context| {
        let (notes, _) = get_notes(context, STORAGE_SLOT, NoteGetterOptions::new());

        assert_eq(notes.len(), 2);
        assert_eq(notes.get(0).note, note);
        assert_eq(notes.get(1).note, other_note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_at_other_contract_discovered_settled_note_fails() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| create_note(context, STORAGE_SLOT, note));

    env.discover_note(emission);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let (retrieved_note, _) = get_note::<MockNote>(context, STORAGE_SLOT);

        assert_eq(retrieved_note.note, note);
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_discovered_at_other_contract_settled_note_fails() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| create_note(context, STORAGE_SLOT, note));

    env.discover_note_at(CONTRACT_ADDRESS, emission);

    env.private_context(|context| { let _ = get_note::<MockNote>(context, STORAGE_SLOT); });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_discovered_settled_note_at_other_contract_fails() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, STORAGE_SLOT, note)
    });

    env.discover_note(emission);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let _ = get_note::<MockNote>(context, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn get_discovered_at_other_contract_settled_note_at_other_contract() {
    let env = TestEnvironment::_new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context_at(CONTRACT_ADDRESS, |context| {
        create_note(context, STORAGE_SLOT, note)
    });

    env.discover_note_at(CONTRACT_ADDRESS, emission);

    env.private_context_at(CONTRACT_ADDRESS, |context| {
        let (retrieved_note, _) = get_note::<MockNote>(context, STORAGE_SLOT);

        assert_eq(retrieved_note.note, note);
    });
}
