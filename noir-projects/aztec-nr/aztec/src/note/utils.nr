use crate::{
    context::PrivateContext,
    note::{note_interface::{NoteInterface, NullifiableNote}, retrieved_note::RetrievedNote},
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    hash::{
        compute_siloed_note_hash,
        compute_siloed_nullifier as compute_siloed_nullifier_from_preimage,
        compute_unique_note_hash,
    },
};

pub fn compute_siloed_nullifier<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
    context: &mut PrivateContext,
) -> Field
where
    Note: NoteInterface + NullifiableNote,
{
    let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
    let inner_nullifier = retrieved_note.note.compute_nullifier(context, note_hash_for_nullify);

    compute_siloed_nullifier_from_preimage(retrieved_note.contract_address, inner_nullifier)
}

// TODO(#7775): make this not impossible to understand
pub fn compute_note_hash_for_read_request<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteInterface,
{
    let note_hash = retrieved_note.note.compute_note_hash(storage_slot);

    // If same tx note, read request always uses the normal note hash
    if retrieved_note.note_hash_counter != 0 {
        note_hash
    } else {
        // If the note comes from a different tx, we need to compute the note hash that reached the tree
        compute_unique_note_hash(
            retrieved_note.nonce,
            compute_siloed_note_hash(retrieved_note.contract_address, note_hash),
        )
    }
}

// TODO(#7775): make this not impossible to understand
pub fn compute_note_hash_for_nullify_internal<Note>(
    retrieved_note: RetrievedNote<Note>,
    note_hash_for_read_request: Field,
) -> Field {
    if (retrieved_note.note_hash_counter != 0) & (retrieved_note.nonce != 0) {
        // Non-revertible note, nullified by a revertible nullifier, we need to nullify the note hash that will reach the tree
        let siloed_note_hash =
            compute_siloed_note_hash(retrieved_note.contract_address, note_hash_for_read_request);

        compute_unique_note_hash(retrieved_note.nonce, siloed_note_hash)
    } else {
        note_hash_for_read_request
    }
}

// TODO(#7775): nuke this commented out code - kept it around as it contains comments which might be helpful when tackling #7775
// pub fn compute_note_hash_for_nullify<Note, let N: u32, let M: u32>(note: Note) -> Field where Note: NoteInterface {
//     let header = note.get_header();
//     // There are 3 cases for reading a note intended for consumption:
//     // 1. The note was inserted in this transaction, is revertible, or is not nullified by a revertible nullifier in
//     //    the same transaction: (note_hash_counter != 0) & (nonce == 0)
//     // 2. The note was inserted in this transaction, is non-revertible, and is nullified by a revertible nullifier in
//     //    the same transaction: (note_hash_counter != 0) & (nonce != 0)
//     // 3. The note was inserted in a previous transaction: (note_hash_counter == 0) & (nonce != 0)

//     let note_hash = note.compute_note_hiding_point().x;

//     if header.nonce == 0 {
//         // Case 1.
//         // If a note is transient, we just read the note_hash (kernel will hash it with nonce and silo by contract address).
//         note_hash
//     } else {
//         // Case 2: If a note is non-revertible, and is nullified by a revertible nullifier, we cannot squash them in the
//         // private reset circuit. Because if the tx reverts, we will have to keep the note hash and throw away the
//         // nullifier.
//         // And if the tx does not revert, both will be emitted. In which case, the nullifier must be created in the app
//         // from the siloed note hash.
//         // The kernel circuit will check that a nullifier with non-zero note_nonce is linked to a note hash, whose
//         // siloed note hash matches the note hash specified in the nullifier.

//         // Case 3: If a note is not from the current transaction, that means we are reading a settled note (from
//         // tree) created in a previous TX. So we need the siloed_note_hash which has already been hashed with
//         // nonce and then contract address. This hash will match the existing leaf in the note hash
//         // tree, so the kernel can just perform a membership check directly on this hash/leaf.
//         let unique_note_hash = compute_unique_note_hash(header.nonce, note_hash);
//         compute_siloed_note_hash(header.contract_address, unique_note_hash)
//         // IMPORTANT NOTE ON REDUNDANT SILOING BY CONTRACT ADDRESS: The note hash computed above is
//         // "siloed" by contract address. When a note hash is computed solely for the purpose of
//         // nullification, it is not strictly necessary to silo the note hash before computing
//         // its nullifier. In other words, it is NOT NECESSARY for protocol security that a nullifier
//         // be computed from a siloed note hash. After all, persistable note hashes and nullifiers are
//         // siloed by the kernel circuit. That being said, the siloed note hash computed above CAN be
//         // used for nullifier computation, and this achieves the (arguably unnecessary) property that
//         // nullifiers are computed from a note hash's fully-computed note hash tree leaf.
//     }
// }

pub fn compute_note_hash_for_nullify<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteInterface + NullifiableNote,
{
    let note_hash_for_read_request =
        compute_note_hash_for_read_request(retrieved_note, storage_slot);
    compute_note_hash_for_nullify_internal(retrieved_note, note_hash_for_read_request)
}

/// Computes the note hash and optionally a nullifier for a given note. `N` is the length of the packed note,
/// `S` is the length of the packed note with its padding array.
///
/// Note: `packed_note_with_padding` is typically constructed by calling the `storage()` method on a `BoundedVec`. This
/// function will then extract the relevant fields from the array using the `subarray` method and the actual packed
/// note length `N`.
// TODO (#11638): simplify or remove this function by inlining it in the `_compute_note_hash_and_nullifier` contract
// library method that is autogenerated by macros.
pub unconstrained fn compute_note_hash_and_optionally_a_nullifier<Note, let N: u32, let S: u32>(
    unpack_note: fn([Field; N]) -> Note,
    contract_address: AztecAddress,
    nonce: Field,
    storage_slot: Field,
    compute_nullifier: bool,
    packed_note_with_padding: [Field; S],
) -> [Field; 4]
where
    Note: NoteInterface + NullifiableNote,
{
    let note = unpack_note(array::subarray(packed_note_with_padding, 0));

    let note_hash = note.compute_note_hash(storage_slot);

    let siloed_note_hash = compute_siloed_note_hash(contract_address, note_hash);
    let unique_note_hash = compute_unique_note_hash(nonce, siloed_note_hash);

    let inner_nullifier = if compute_nullifier {
        note.compute_nullifier_without_context(storage_slot, contract_address, nonce)
    } else {
        0
    };
    // docs:start:compute_note_hash_and_optionally_a_nullifier_returns
    [note_hash, unique_note_hash, siloed_note_hash, inner_nullifier]
    // docs:end:compute_note_hash_and_optionally_a_nullifier_returns
}
