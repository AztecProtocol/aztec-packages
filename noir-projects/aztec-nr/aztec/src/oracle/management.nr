use std::static_assert;

use crate::{
    context::unconstrained_context::UnconstrainedContext, note::note_header::NoteHeader,
    utils::array,
};
use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    hash::compute_note_hash_nonce,
};

global NOTE_LOG_RESERVED_FIELDS: u32 = 2;
global MAX_NOTE_SERIALIZED_LEN: u32 = PRIVATE_LOG_SIZE_IN_FIELDS - NOTE_LOG_RESERVED_FIELDS;

pub struct NoteHashesAndNullifier {
    pub note_hash: Field,
    pub siloed_note_hash: Field,
    pub inner_nullifier: Field,
}

fn for_each_bounded_vec<T, let MaxLen: u32, Env>(
    vec: BoundedVec<T, MaxLen>,
    f: fn[Env](T, u32) -> (),
) {
    for i in 0..MaxLen {
        if i < vec.len() {
            f(vec.get_unchecked(i), i);
        }
    }
}

// fn foo<let N: u32>(
//     serialized_note_content: BoundedVec<Field, N>,
//     note_header: NoteHeader,
//     note_type_id: Field,
// ) -> NoteHashesAndNullifier {
//     let hashes = if note_type_id == 2 {
//         assert(serialized_note_content.len() == ValueNote.serialization_length());
//         crate::note::utils::compute_note_hash_and_optionally_a_nullifier(
//             ValueNote::deserialize,
//             note_header,
//             true,
//             serialized_note_content.storage(),
//         )
//     } else if note_type_id == 3 {
//         assert(serialized_note_content.len() == AddressNote.serialization_length());
//         crate::note::utils::compute_note_hash_and_optionally_a_nullifier(
//             AddressNote::deserialize,
//             note_header,
//             true,
//             serialized_note_content.storage(),
//         )
//     } else {
//         panic(f"Unknown note type id {note_type_id}")
//     };

//     NoteHashesAndNullifier {
//         note_hash: hashes[0],
//         siloed_note_hash: hashes[2],
//         inner_nullifier: hashes[3],
//     }
// }

pub unconstrained fn process_log<Env>(
    context: UnconstrainedContext,
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    tx_hash: Field,
    siloed_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, NoteHeader, Field) -> NoteHashesAndNullifier,
) {
    assert(log_plaintext.len() >= NOTE_LOG_RESERVED_FIELDS);

    static_assert(
        NOTE_LOG_RESERVED_FIELDS == 2,
        "unepxected value for NOTE_LOG_RESERVED_FIELDS",
    );
    let storage_slot = log_plaintext.get(0);
    let note_type_id = log_plaintext.get(1);

    let serialized_note_content: BoundedVec<_, MAX_NOTE_SERIALIZED_LEN> =
        array::subbvec(log_plaintext, NOTE_LOG_RESERVED_FIELDS);

    for_each_bounded_vec(
        siloed_note_hashes_in_tx,
        |siloed_note_hash, i| {
            let nonce = compute_note_hash_nonce(tx_hash, i);

            let header = NoteHeader::new(context.this_address(), nonce, storage_slot);

            let hashes = compute_note_hash_and_nullifier(serialized_note_content, header, note_type_id);
            if siloed_note_hash == hashes.siloed_note_hash {
                deliver_note(
                    context.this_address(), // PXE will reject any address that is not ourselves anyway
                    storage_slot,
                    nonce,
                    serialized_note_content,
                    hashes.note_hash,
                    hashes.inner_nullifier,
                    tx_hash,
                    recipient,
                );
            }
        },
    );
}

pub unconstrained fn deliver_note(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) {
    // TODO: do something instead of failing (e.g. not advance tagging indices)
    assert(deliver_note_oracle(
        contract_address,
        storage_slot,
        nonce,
        content,
        note_hash,
        nullifier,
        tx_hash,
        recipient,
    ), "Failed to deliver note");
}

#[oracle(deliverNote)]
unconstrained fn deliver_note_oracle(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {}
