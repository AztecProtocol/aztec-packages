use crate::{
    messages::{
        encoding::{encode_message, MAX_MESSAGE_CONTENT_LEN, MESSAGE_EXPANDED_METADATA_LEN},
        msg_type::PRIVATE_NOTE_MSG_TYPE_ID,
    },
    note::note_interface::NoteType,
    utils::array,
};
use protocol_types::{address::AztecAddress, traits::{FromField, Packable, ToField}};

/// The number of fields in a private note message content that are not the note's packed representation.
pub(crate) global PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN: u32 = 3;

pub(crate) global PRIVATE_NOTE_MSG_PLAINTEXT_OWNER_INDEX: u32 = 0;
pub(crate) global PRIVATE_NOTE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX: u32 = 1;
pub(crate) global PRIVATE_NOTE_MSG_PLAINTEXT_RANDOMNESS_INDEX: u32 = 2;

/// The maximum length of the packed representation of a note's contents. This is limited by private log size,
/// encryption overhead and extra fields in the message (e.g. message type id, storage slot, randomness, etc.).
pub global MAX_NOTE_PACKED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN;

/// Creates the plaintext for a private note message (i.e. one of type [PRIVATE_NOTE_MSG_TYPE_ID]).
///
/// This plaintext is meant to be decoded via [decode_private_note_message].
pub fn encode_private_note_message<Note>(
    note: Note,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    ) -> [Field; PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <Note as Packable>::N + MESSAGE_EXPANDED_METADATA_LEN]
where
    Note: NoteType + Packable,
{
    let packed_note = note.pack();

    // If PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // encoding below must be updated as well.
    std::static_assert(
        PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 3,
        "unexpected value for PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN",
    );

    let mut msg_content =
        [0; PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <Note as Packable>::N];
    msg_content[PRIVATE_NOTE_MSG_PLAINTEXT_OWNER_INDEX] = owner.to_field();
    msg_content[PRIVATE_NOTE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX] = storage_slot;
    msg_content[PRIVATE_NOTE_MSG_PLAINTEXT_RANDOMNESS_INDEX] = randomness;
    for i in 0..packed_note.len() {
        msg_content[PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + i] = packed_note[i];
    }

    // Notes use the note type id for metadata
    encode_message(PRIVATE_NOTE_MSG_TYPE_ID, Note::get_id() as u64, msg_content)
}

/// Decodes the plaintext from a private note message (i.e. one of type [PRIVATE_NOTE_MSG_TYPE_ID]).
///
/// This plaintext is meant to have originated from [encode_private_note_message].
///
/// Note that while [encode_private_note_message] returns a fixed-size array, this function takes a [BoundedVec]
/// instead. This is because when decoding we're typically processing runtime-sized plaintexts, more specifically, those
/// that originate from [crate::messages::encryption::message_encryption::MessageEncryption::decrypt].
pub(crate) unconstrained fn decode_private_note_message(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (Field, AztecAddress, Field, Field, BoundedVec<Field, MAX_NOTE_PACKED_LEN>) {
    let note_type_id = msg_metadata as Field; // TODO: make note type id not be a full field

    assert(
        msg_content.len() > PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN,
        f"Invalid private note message: all private note messages must have at least {PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN} fields",
    );

    // If PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // decoding below must be updated as well.
    std::static_assert(
        PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 3,
        "unexpected value for PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN",
    );

    let owner = AztecAddress::from_field(msg_content.get(PRIVATE_NOTE_MSG_PLAINTEXT_OWNER_INDEX));
    let storage_slot = msg_content.get(PRIVATE_NOTE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX);
    let randomness = msg_content.get(PRIVATE_NOTE_MSG_PLAINTEXT_RANDOMNESS_INDEX);
    let packed_note = array::subbvec(msg_content, PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN);

    (note_type_id, owner, storage_slot, randomness, packed_note)
}

mod test {
    use crate::{
        messages::{
            encoding::decode_message,
            logs::note::{decode_private_note_message, encode_private_note_message},
            msg_type::PRIVATE_NOTE_MSG_TYPE_ID,
        },
        note::note_interface::NoteType,
    };
    use crate::test::mocks::mock_note::MockNote;
    use protocol_types::{address::AztecAddress, traits::{FromField, Packable}};

    global VALUE: Field = 7;
    global OWNER: AztecAddress = AztecAddress::from_field(8);
    global STORAGE_SLOT: Field = 9;
    global RANDOMNESS: Field = 10;

    #[test]
    unconstrained fn encode_decode() {
        let note = MockNote::new(VALUE).build_note();

        let message_plaintext = encode_private_note_message(note, OWNER, STORAGE_SLOT, RANDOMNESS);

        let (msg_type_id, msg_metadata, msg_content) =
            decode_message(BoundedVec::from_array(message_plaintext));

        assert_eq(msg_type_id, PRIVATE_NOTE_MSG_TYPE_ID);

        let (note_type_id, owner, storage_slot, randomness, packed_note) =
            decode_private_note_message(msg_metadata, msg_content);

        assert_eq(note_type_id, MockNote::get_id());
        assert_eq(owner, OWNER);
        assert_eq(storage_slot, STORAGE_SLOT);
        assert_eq(randomness, RANDOMNESS);
        assert_eq(packed_note, BoundedVec::from_array(note.pack()));
    }
}
