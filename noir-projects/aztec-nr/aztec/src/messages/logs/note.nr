use crate::{
    context::PrivateContext,
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        logs::utils::prefix_with_tag,
        msg_type::{PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID},
    },
    note::{note_emission::NoteEmission, note_interface::NoteType},
    oracle::offchain_effect::emit_offchain_effect,
    utils::{array::subarray::subarray, remove_constraints::remove_constraints},
};
use protocol_types::{
    abis::note_hash::NoteHash,
    address::AztecAddress,
    constants::{PRIVATE_LOG_CIPHERTEXT_LEN, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::Packable,
};

// TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?
fn assert_note_exists(context: PrivateContext, note_hash_counter: u32) {
    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");
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
        PRIVATE_NOTE_MSG_TYPE_ID,
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
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
    )
}

fn compute_log<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
    msg_type: u64,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    let packed_note = note.pack();

    // A note message's content is the storage slot followed by the packed note representation
    let mut msg_content: [Field; N + 1] = std::mem::zeroed();
    msg_content[0] = storage_slot;
    for i in 0..packed_note.len() {
        msg_content[1 + i] = packed_note[i];
    }

    // Notes use the note type id for metadata
    let plaintext = encode_message(msg_type, Note::get_id() as u64, msg_content);

    let ciphertext = AES128::encrypt_log(plaintext, recipient);

    let log = prefix_with_tag(ciphertext, sender, recipient);

    log
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
        // Regardless of the original note size `N, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = encrypted_log.len();
        context.emit_raw_note_log(encrypted_log, length, note_hash_counter);
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
        let encrypted_log = unsafe {
            remove_constraints(|| compute_note_log(note, storage_slot, recipient, sender))
        };
        // Regardless of the original note size `N`, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = encrypted_log.len();
        context.emit_raw_note_log(encrypted_log, length, note_hash_counter);
    }
}

/// Same as `encode_and_encrypt_note_unconstrained`, except the note is emitted as an offchain message instead of a
/// private log.
///
/// Like `encode_and_encrypt_note_unconstrained`, this function uses unconstrained encryption. The sender can set any
/// message contents, potentially preventing recipient decryption and resulting in note loss. Since offchain messages
/// inherently lack delivery guarantees, constrained encryption provides no benefit and is not offered.
///
/// While delivery is not guaranteed, message integrity is still protected via cryptographic commitments in the note
/// hash tree. For guaranteed delivery, use `encode_and_encrypt_note` with private logs instead. See
/// `oracle::offchain_effect::emit_offchain_effect` for more details on delivery guarantees.
pub fn encode_and_encrypt_note_and_emit_as_offchain_effect<Note, let N: u32>(
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
        let encrypted_log = unsafe {
            remove_constraints(|| compute_note_log(note, storage_slot, recipient, sender))
        };

        // Remove the tag from the log
        // TODO: This is a tech debt. We should refactor this file such that the log is by default computed without
        // the tag.
        let message_ciphertext: [_; PRIVATE_LOG_CIPHERTEXT_LEN] = subarray(encrypted_log, 1);

        emit_offchain_effect(message_ciphertext, recipient);
    }
}
