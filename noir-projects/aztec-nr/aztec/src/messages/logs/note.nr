use crate::{
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        logs::utils::prefix_with_tag,
        msg_type::PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
    },
    note::note_interface::NoteType,
};
use protocol_types::{
    address::AztecAddress,
    constants::{PRIVATE_LOG_CIPHERTEXT_LEN, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::Packable,
};

// TODO(#16881): once partial notes support emission via an offchain message we will most likely want to remove this.
pub fn compute_partial_note_log<Note>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable,
{
    let ciphertext = compute_note_message_ciphertext(
        note,
        storage_slot,
        recipient,
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
    );

    let log = prefix_with_tag(ciphertext, recipient);

    log
}

pub fn compute_note_message_ciphertext<Note>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    msg_type: u64,
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN]
where
    Note: NoteType + Packable,
{
    let packed_note = note.pack();

    // A note message's content is the storage slot followed by the packed note representation
    let mut msg_content = [0; 1 + <Note as Packable>::N];
    msg_content[0] = storage_slot;
    for i in 0..packed_note.len() {
        msg_content[1 + i] = packed_note[i];
    }

    // Notes use the note type id for metadata
    let plaintext = encode_message(msg_type, Note::get_id() as u64, msg_content);

    AES128::encrypt_log(plaintext, recipient)
}
