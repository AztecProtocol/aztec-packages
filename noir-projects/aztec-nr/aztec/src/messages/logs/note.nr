use crate::{
    messages::{
        encoding::{encode_message, MESSAGE_EXPANDED_METADATA_LEN},
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::utils::prefix_with_tag,
        msg_type::{PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID},
    },
    note::note_interface::NoteType,
};
use protocol_types::{
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::{Packable, ToField},
};

global PRIVATE_NOTE_RESERVED_FIELDS: u32 = 3;
global PRIVATE_NOTE_OWNER_INDEX: u32 = 0;
global PRIVATE_NOTE_STORAGE_SLOT_INDEX: u32 = 1;
global PRIVATE_NOTE_RANDOMNESS_INDEX: u32 = 2;

// TODO(#16881): once partial notes support emission via an offchain message we will most likely want to remove this.
pub fn compute_partial_note_private_content_log<PartialNotePrivateContent>(
    partial_note_private_content: PartialNotePrivateContent,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    PartialNotePrivateContent: NoteType + Packable,
{
    let message_plaintext = partial_note_private_content_to_message_plaintext(
        partial_note_private_content,
        owner,
        storage_slot,
        randomness,
    );
    let message_ciphertext = AES128::encrypt(message_plaintext, recipient);

    prefix_with_tag(message_ciphertext, recipient)
}

pub fn private_note_to_message_plaintext<Note>(
    note: Note,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
) -> [Field; <Note as Packable>::N + PRIVATE_NOTE_RESERVED_FIELDS + MESSAGE_EXPANDED_METADATA_LEN]
where
    Note: NoteType + Packable,
{
    let packed_note = note.pack();

    let mut msg_content = [0; PRIVATE_NOTE_RESERVED_FIELDS + <Note as Packable>::N];
    msg_content[PRIVATE_NOTE_OWNER_INDEX] = owner.to_field();
    msg_content[PRIVATE_NOTE_STORAGE_SLOT_INDEX] = storage_slot;
    msg_content[PRIVATE_NOTE_RANDOMNESS_INDEX] = randomness;
    for i in 0..packed_note.len() {
        msg_content[PRIVATE_NOTE_RESERVED_FIELDS + i] = packed_note[i];
    }

    // Notes use the note type id for metadata
    encode_message(PRIVATE_NOTE_MSG_TYPE_ID, Note::get_id() as u64, msg_content)
}

pub fn partial_note_private_content_to_message_plaintext<PartialNotePrivateContent>(
    partial_note_private_content: PartialNotePrivateContent,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    ) -> [Field; <PartialNotePrivateContent as Packable>::N + PRIVATE_NOTE_RESERVED_FIELDS + MESSAGE_EXPANDED_METADATA_LEN]
where
    PartialNotePrivateContent: NoteType + Packable,
{
    let packed_private_content = partial_note_private_content.pack();

    // A partial note message's content is the storage slot, followed by the randomness,
    // followed by the packed private content representation
    let mut msg_content =
        [0; PRIVATE_NOTE_RESERVED_FIELDS + <PartialNotePrivateContent as Packable>::N];
    msg_content[PRIVATE_NOTE_OWNER_INDEX] = owner.to_field();
    msg_content[PRIVATE_NOTE_STORAGE_SLOT_INDEX] = storage_slot;
    msg_content[PRIVATE_NOTE_RANDOMNESS_INDEX] = randomness;
    for i in 0..packed_private_content.len() {
        msg_content[PRIVATE_NOTE_RESERVED_FIELDS + i] = packed_private_content[i];
    }

    encode_message(
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
        // Notes use the note type id for metadata
        PartialNotePrivateContent::get_id() as u64,
        msg_content,
    )
}
