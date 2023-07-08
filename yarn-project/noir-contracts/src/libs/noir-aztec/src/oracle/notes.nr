use crate::context::Context;
use crate::abi::MAX_READ_REQUESTS;
use crate::types::point::Point;
use crate::utils::arr_copy_slice;


// TODO: Replace returned number of notes (MAX_READ_REQUESTS) with a larger global value.

// Hacky way to force stepwise execution of oracle calls by injecting
// strict dependencies. Call this after an oracle call and then
// pass context.oracle_connector to next oracle call.
// TODO(dbanks12): remove when closed: https://github.com/noir-lang/acvm/pull/399
fn force_oracle_ordering<N>(mut context: Context, oracle_ret: [Field; N]) -> Context {
    let connector_hash = dep::std::hash::pedersen([oracle_ret[0]])[0];
    context.oracle_connector = connector_hash;
    context
}

#[oracle(notifyCreatedNote)]
fn notify_created_note_oracle<N>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _preimage: [Field; N],
) -> [Field; 1] {}

unconstrained fn notify_created_note_wrapper<N>(
    oracle_connector: Field,
    storage_slot: Field,
    preimage: [Field; N],
) -> Field {
    notify_created_note_oracle(oracle_connector, storage_slot, preimage)[0]
}

fn notify_created_note<N>(
    mut context: Context,
    storage_slot: Field,
    preimage: [Field; N],
) -> (Context, Field) {
    let ret = notify_created_note_wrapper(context.oracle_connector, storage_slot, preimage);
    context = force_oracle_ordering(context, [ret]);
    (context, ret)
}

#[oracle(notifyNullifiedNote)]
fn notify_nullified_note_oracle<N>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _nullifier: Field,
    _preimage: [Field; N],
) -> [Field; 1] {}

unconstrained fn notify_nullified_note_wrapper<N>(
    oracle_connector: Field,
    storage_slot: Field,
    nullifier: Field,
    preimage: [Field; N],
) -> Field {
    notify_nullified_note_oracle(oracle_connector, storage_slot, nullifier, preimage)[0]
}

fn notify_nullified_note<N>(
    mut context: Context,
    storage_slot: Field,
    nullifier: Field,
    preimage: [Field; N],
) -> (Context, Field) {
    let ret = notify_nullified_note_wrapper(context.oracle_connector, storage_slot, nullifier, preimage);
    context = force_oracle_ordering(context, [ret]);
    (context, ret)
}

#[oracle(getNote)]
fn get_note_oracle<S>(_oracle_connector: Field, w_storage_slot: Field) -> [Field; S] {}

#[oracle(getNotes)]
fn get_notes_oracle<N, S>(
    _oracle_connector: Field,
    _storage_slot: Field,
    _note_size: u32,
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
    let note_size: comptime u32 = N;
    let return_size = fields.len() as u32;
    get_notes_oracle(oracle_connector, storage_slot, note_size, sort_by, sort_order, limit, offset, return_size, fields)
}

// TODO: The following functions should all be unconstrained.

fn get_note<Note, N>(
    mut context: Context,
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
) -> (Context, Note) {
    let fields = get_note_oracle(context.oracle_connector, storage_slot);
    context = force_oracle_ordering(context, fields);

    let has_note = fields[0] == 1;
    if (has_note) {
        (context, deserialise(arr_copy_slice(fields, [0; N], 1)))
    } else {
        (context, dummy())
    }
}

fn get_notes<Note, N, S, NS>(
    mut context: Context,
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> Note,
    dummy: fn () -> Note,
    sort_by: [u8; N],
    sort_order: [u8; N],
    limit: u32,
    offset: u32,
    mut notes: [Note; S], // TODO: Remove it and use `limit` to initialise the note array.
    zero_fields: [Field; NS], // TODO: Remove it and use `limit` to initialise the note array.
) -> (Context, [Note; S]) {
    let fields = get_notes_oracle_wrapper(context.oracle_connector, storage_slot, sort_by, sort_order, limit, offset, zero_fields);
    context = force_oracle_ordering(context, fields);
    let num_notes = fields[0] as u32;
    for i in 0..notes.len() {
        if i as u32 < num_notes {
            let read_offset: comptime Field = 1 + i * N;
            let preimage = arr_copy_slice(fields, [0; N], read_offset);
            let note = deserialise(preimage);
            notes[i] = note;
        };
    };
    (context, notes)
}

unconstrained fn is_nullifier_emitted(nullifier: Field) -> bool {
    // TODO
    nullifier == 0
}