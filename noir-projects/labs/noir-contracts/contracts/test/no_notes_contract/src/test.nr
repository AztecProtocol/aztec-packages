use crate::NoNotes;
use aztec::protocol::address::AztecAddress;

// The contract declares no note types, so there is never a note to hash or nullify: every input must be skipped
// (return `Option::none()`) regardless of its contents, so that malicious messages about non-existent notes are
// ignored.

#[test]
unconstrained fn compute_note_hash_skips() {
    let result = NoNotes::test_compute_note_hash(
        BoundedVec::from_array([42]),
        AztecAddress::zero(),
        0,
        0xdeadbeef,
        AztecAddress::zero(),
        0,
    );

    assert(result.is_none());
}

#[test]
unconstrained fn compute_note_nullifier_skips() {
    let result = NoNotes::test_compute_note_nullifier(
        0,
        BoundedVec::from_array([42]),
        AztecAddress::zero(),
        0,
        0xdeadbeef,
        AztecAddress::zero(),
        0,
    );

    assert(result.is_none());
}

#[test]
unconstrained fn compute_note_hash_and_nullifier_skips() {
    let result = NoNotes::test_compute_note_hash_and_nullifier(
        BoundedVec::from_array([42]),
        AztecAddress::zero(),
        0,
        0xdeadbeef,
        AztecAddress::zero(),
        0,
        0,
    );

    assert(result.is_none());
}
