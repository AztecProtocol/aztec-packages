use crate::abi::MAX_READ_REQUESTS;
use crate::types::point::Point;
use crate::utils::arr_copy_slice;


// TODO: Replace returned number of notes (MAX_READ_REQUESTS) with a larger global value.

// Hacky way to force stepwise execution of oracle calls by injecting
// strict dependencies. Call this after an oracle call and then
// pass context.oracle_connector to next oracle call.
// TODO(dbanks12): remove when closed: https://github.com/noir-lang/acvm/pull/399
fn force_oracle_ordering<N>(oracle_connector: &mut Field, oracle_ret: [Field; N]) {
    *oracle_connector = dep::std::hash::pedersen([oracle_ret[0]])[0];
}

#[oracle(notifyCreatedNote)]
fn notify_created_note_oracle<N>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _preimage: [Field; N],
) -> Field {}

unconstrained fn notify_created_note_wrapper<N>(
    oracle_connector: Field,
    storage_slot: Field,
    preimage: [Field; N],
) -> Field {
    notify_created_note_oracle(oracle_connector, storage_slot, preimage)
}

fn notify_created_note<N>(
    oracle_connector: &mut Field,
    storage_slot: Field,
    preimage: [Field; N],
) -> Field {
    let ret = notify_created_note_wrapper(*oracle_connector, storage_slot, preimage);
    force_oracle_ordering(oracle_connector, [ret]);
    ret
}

#[oracle(notifyNullifiedNote)]
fn notify_nullified_note_oracle<N>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _nullifier: Field,
    _preimage: [Field; N],
) -> Field {}

unconstrained fn notify_nullified_note_wrapper<N>(
    oracle_connector: Field,
    storage_slot: Field,
    nullifier: Field,
    preimage: [Field; N],
) -> Field {
    notify_nullified_note_oracle(oracle_connector, storage_slot, nullifier, preimage)
}

fn notify_nullified_note<N>(
    oracle_connector: &mut Field,
    storage_slot: Field,
    nullifier: Field,
    preimage: [Field; N],
) -> Field {
    let ret = notify_nullified_note_wrapper(*oracle_connector, storage_slot, nullifier, preimage);
    force_oracle_ordering(oracle_connector, [ret]);
    ret
}

#[oracle(getNote)]
fn get_note_oracle<S>(_oracle_connector: Field, _storage_slot: Field) -> [Field; S] {}

#[oracle(getNotes)]
fn get_notes_oracle<N, S>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _sort_by: [u8; N],
    _sort_order: [u8; N],
    _limit: u32,
    _offset: u32,
    _return_size: u32,
    _zero_fields: [Field; S],
) -> [Field; S] {}

unconstrained fn get_notes_oracle_wrapper<N, S>(
    oracle_connector: Field,
    storage_slot: Field,
    sort_by: [u8; N],
    sort_order: [u8; N],
    limit: u32,
    offset: u32,
    mut fields: [Field; S],
)-> [Field; S] {
    let return_size = fields.len() as u32;
    get_notes_oracle(oracle_connector, storage_slot, sort_by, sort_order, limit, offset, return_size, fields)
}

// TODO: The following functions should all be unconstrained.

fn get_note<Note, N>(
    oracle_connector: &mut Field,
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
) -> Note {
    let fields = get_note_oracle(*oracle_connector, storage_slot);
    force_oracle_ordering(oracle_connector, fields);

    let has_note = fields[0] == 1;
    if (has_note) {
        deserialise(arr_copy_slice(fields, [0; N], 1))
    } else {
        dummy()
    }
}

fn get_notes<Note, N, S, NS>(
    oracle_connector: &mut Field,
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    limit: u32,
    offset: u32,
    mut notes: [Note; S], // TODO: Remove it and use `limit` to initialise the note array.
    zero_fields: [Field; NS], // TODO: Remove it and use `limit` to initialise the note array.
) -> [Note; S] {
    let fields = get_notes_oracle_wrapper(*oracle_connector, storage_slot, sort_by, sort_order, limit, offset, zero_fields);
    force_oracle_ordering(oracle_connector, fields);
    let num_notes = fields[0] as u32;
    for i in 0..notes.len() {
        if i as u32 < num_notes {
            let read_offset: comptime Field = 1 + i * N;
            let preimage = arr_copy_slice(fields, [0; N], read_offset);
            let note = deserialise(preimage);
            notes[i] = note;
        };
    };
    notes
}

unconstrained fn is_nullifier_emitted(nullifier: Field) -> bool {
    // TODO
    nullifier == 0
}