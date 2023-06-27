use crate::abi::MAX_READ_REQUESTS;
use crate::types::point::Point;
use crate::utils::arr_copy_slice;

#[oracle(notifyCreatedNote)]
fn notify_created_note_oracle<N>(
    _storage_slot: Field,
    _owner: Point,
    _preimage: [Field; N],
) -> [Field; 1] {}

unconstrained fn notify_created_note<N>(
    storage_slot: Field,
    owner: Point,
    preimage: [Field; N],
) -> Field {
    notify_created_note_oracle(storage_slot, owner, preimage)[0]
}

#[oracle(notifyNullifiedNote)]
fn notify_nullified_note_oracle<N>(
    _storage_slot: Field,
    _nullifier: Field,
    _preimage: [Field; N],
) -> [Field; 1] {}

unconstrained fn notify_nullified_note<N>(
    storage_slot: Field,
    nullifier: Field,
    preimage: [Field; N],
) -> Field {
    notify_nullified_note_oracle(storage_slot, nullifier, preimage)[0]
}

#[oracle(getNotes2)]
fn get_notes_2_oracle(
    _storage_slot: Field,
) -> [Field; 13] {}

unconstrained fn get_note<Note, N>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
) -> Note {
    // TODO: get_note_oracle
    let fields = get_notes_2_oracle(storage_slot);
    deserialise(arr_copy_slice(fields, [0; N], 1))
}

unconstrained fn get_max_notes<Note, N>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    skip: u8,
) -> [Note; MAX_READ_REQUESTS] {
    // TODO: get_max_notes_oracle
    let fields = get_notes_2_oracle(storage_slot);
    let preimage1 = arr_copy_slice(fields, [0; N], 1);
    let note1 = deserialise(preimage1);
    let preimage2 = arr_copy_slice(fields, [0; N], 1 + preimage1.len());
    let note2 = deserialise(preimage2);
    [note1, note2, dummy(), dummy()]
}

unconstrained fn get_notes<Note, N, S, P>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    skip: u8,
    filter: fn ([Note; MAX_READ_REQUESTS], P) -> [Note; S],
    filter_args: P,
) -> [Note; S] {
    let notes = get_max_notes(storage_slot, deserialise, dummy, sort_by, sort_order, skip);
    filter(notes, filter_args)
}

unconstrained fn is_nullifier_emitted(nullifier: Field) -> bool {
    // TODO
    nullifier == 0
}