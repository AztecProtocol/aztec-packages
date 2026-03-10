use crate::{NoteHashAndNullifier, test_note::TestNote};
use aztec::note::note_interface::{NoteHash, NoteType};
use aztec::protocol::address::AztecAddress;

#[test]
unconstrained fn returns_none_for_bad_note_length() {
    // TestNote has Packable N=1, but we provide 2 fields
    let packed_note = BoundedVec::from_array([42, 99]);

    let result = NoteHashAndNullifier::test_compute_note_hash_and_nullifier(
        packed_note,
        AztecAddress::zero(),
        0,
        TestNote::get_id(),
        AztecAddress::zero(),
        0,
        0,
    );

    assert(result.is_none());
}

#[test]
unconstrained fn returns_correct_note_hash_and_nullifier() {
    // TestNote has Packable N=1
    let packed_note = BoundedVec::from_array([42]);

    let owner = AztecAddress::zero();
    let storage_slot = 0;
    let randomness = 0;

    let result = NoteHashAndNullifier::test_compute_note_hash_and_nullifier(
        packed_note,
        owner,
        storage_slot,
        TestNote::get_id(),
        AztecAddress::zero(),
        randomness,
        1,
    );

    let note_hash_and_nullifier = result.unwrap();
    let note = TestNote { value: 42 };
    let expected_note_hash = note.compute_note_hash(owner, storage_slot, randomness);
    assert_eq(note_hash_and_nullifier.note_hash, expected_note_hash);

    // TestNote::compute_nullifier_unconstrained returns a hardcoded Some(2) so we can verify the
    // macro-generated function propagates the inner nullifier correctly.
    assert_eq(note_hash_and_nullifier.inner_nullifier.unwrap(), 2);
}
