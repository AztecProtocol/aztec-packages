use crate::{
    context::PrivateContext,
    encrypted_logs::{
        encrypt::aes128::AES128,
        log_assembly_strategies::default_aes128::utils::prefix_with_tag,
        log_encryption::LogEncryption,
        log_type::{PARTIAL_NOTE_PRIVATE_LOG_TYPE_ID, PRIVATE_NOTE_LOG_TYPE_ID},
        metadata_packing::to_expanded_metadata,
    },
    note::{note_emission::NoteEmission, note_interface::NoteType},
};
use protocol_types::{
    abis::note_hash::NoteHash, address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::Packable,
};

// TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?
fn assert_note_exists<let N: u32>(context: PrivateContext, note_hash_counter: u32) {
    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");
}

/// This particular log assembly strategy (AES 128) requires the note (and the
/// note_id and the storage_slot) to be converted into bytes, because the aes function
/// operates on bytes; not fields.
/// NB: The "2" in "N + 2" is for the note_id and the storage_slot of the note:
fn compute_note_plaintext_for_this_strategy<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    log_type_id: u64,
) -> [Field; (N + 2)]
where
    Note: NoteType + Packable<N>,
{
    let packed_note = note.pack();

    let mut fields = [0; N + 2];

    // We pack log type id and log metadata into the first field. Search for `decode_log_plaintext` function to see
    // where the value gets decoded.
    fields[0] = to_expanded_metadata(Note::get_id() as u64, log_type_id);
    fields[1] = storage_slot;
    for i in 0..packed_note.len() {
        fields[i + 2] = packed_note[i];
    }

    fields
}

pub fn compute_note_log<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    compute_log(
        note,
        storage_slot,
        recipient,
        sender,
        PRIVATE_NOTE_LOG_TYPE_ID,
    )
}

pub fn compute_partial_note_log<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    compute_log(
        note,
        storage_slot,
        recipient,
        sender,
        PARTIAL_NOTE_PRIVATE_LOG_TYPE_ID,
    )
}

fn compute_log<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
    log_type_id: u64,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    let plaintext = compute_note_plaintext_for_this_strategy(note, storage_slot, log_type_id);

    let ciphertext = AES128::encrypt_log(plaintext, recipient);

    let log = prefix_with_tag(ciphertext, sender, recipient);

    log
}

pub unconstrained fn compute_note_log_unconstrained<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    compute_note_log(note, storage_slot, recipient, sender)
}

/// Sends an encrypted message to `recipient` with the content of the note, which they will discover when processing
/// private logs.
pub fn encode_and_encrypt_note<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteType + Packable<N>,
{
    |e: NoteEmission<Note>| {
        let note = e.note;
        let storage_slot = e.storage_slot;
        let note_hash_counter = e.note_hash_counter;
        assert_note_exists(*context, note_hash_counter);

        let encrypted_log = compute_note_log(note, storage_slot, recipient, sender);
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

/// Same as `encode_and_encrypt_note`, except encryption is unconstrained. This means that the sender is free to make
/// the log contents be whatever they wish, potentially resulting in scenarios in which the recipient is unable to
/// decrypt and process the payload, **leading to the note being lost**.
///
/// Only use this function in scenarios where the recipient not receiving the note is an acceptable outcome.
pub fn encode_and_encrypt_note_unconstrained<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteType + Packable<N>,
{
    |e: NoteEmission<Note>| {
        let note = e.note;
        let storage_slot = e.storage_slot;
        let note_hash_counter = e.note_hash_counter;

        assert_note_exists(*context, note_hash_counter);

        // Safety: this function does not constrain the encryption of the log, as explained on its description.
        let encrypted_log =
            unsafe { compute_note_log_unconstrained(note, storage_slot, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}
