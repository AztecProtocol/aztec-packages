use crate::{
    messages::{
        encoding::{encode_message, MAX_MESSAGE_CONTENT_LEN, MESSAGE_EXPANDED_METADATA_LEN},
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::utils::prefix_with_tag,
        msg_type::PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
    },
    note::note_interface::NoteType,
    utils::array,
};
use crate::protocol::{
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::{FromField, Packable, ToField},
};

/// The number of fields in a private note message content that are not the note's packed representation.
pub(crate) global PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN: u32 = 4;
pub(crate) global PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_OWNER_INDEX: u32 = 0;
pub(crate) global PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX: u32 = 1;
pub(crate) global PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RANDOMNESS_INDEX: u32 = 2;
pub(crate) global PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NOTE_COMPLETION_LOG_TAG_INDEX: u32 = 3;

/// Partial notes have a maximum packed length of their private fields bound by extra content in their private message
/// (e.g. the storage slot, note completion log tag, etc.).
pub global MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN;

// TODO(#16881): once partial notes support delivery via an offchain message we will most likely want to remove this.
pub fn compute_partial_note_private_content_log<PartialNotePrivateContent>(
    partial_note_private_content: PartialNotePrivateContent,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    recipient: AztecAddress,
    note_completion_log_tag: Field,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    PartialNotePrivateContent: NoteType + Packable,
{
    let message_plaintext = encode_partial_note_private_message(
        partial_note_private_content,
        owner,
        storage_slot,
        randomness,
        note_completion_log_tag,
    );
    let message_ciphertext = AES128::encrypt(message_plaintext, recipient);

    prefix_with_tag(message_ciphertext, recipient)
}

/// Creates the plaintext for a partial note private message (i.e. one of type [`PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID`]).
///
/// This plaintext is meant to be decoded via [`decode_partial_note_private_message`].
pub fn encode_partial_note_private_message<PartialNotePrivateContent>(
    partial_note_private_content: PartialNotePrivateContent,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_completion_log_tag: Field,
    ) -> [Field; PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <PartialNotePrivateContent as Packable>::N + MESSAGE_EXPANDED_METADATA_LEN]
where
    PartialNotePrivateContent: NoteType + Packable,
{
    let packed_private_content = partial_note_private_content.pack();

    // If PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NON_NOTE_FIELDS_LEN is changed, causing the assertion below to fail, then
    // the encoding below must be updated as well.
    std::static_assert(
        PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 4,
        "unexpected value for PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NON_NOTE_FIELDS_LEN",
    );

    let mut msg_content =
        [0; PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <PartialNotePrivateContent as Packable>::N];
    msg_content[PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_OWNER_INDEX] = owner.to_field();
    msg_content[PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX] = storage_slot;
    msg_content[PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RANDOMNESS_INDEX] = randomness;
    msg_content[PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NOTE_COMPLETION_LOG_TAG_INDEX] = note_completion_log_tag;

    for i in 0..packed_private_content.len() {
        msg_content[PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + i] = packed_private_content[i];
    }

    encode_message(
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
        // Notes use the note type id for metadata
        PartialNotePrivateContent::get_id() as u64,
        msg_content,
    )
}

/// Decodes the plaintext from a private note message (i.e. one of type [`PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID`]).
///
/// This plaintext is meant to have originated from [`encode_partial_note_private_message`].
///
/// Note that while [`encode_partial_note_private_message`] returns a fixed-size array, this function takes a
/// [`BoundedVec`] instead. This is because when decoding we're typically processing runtime-sized plaintexts, more
/// specifically, those that originate from
/// [`crate::messages::encryption::message_encryption::MessageEncryption::decrypt`].
pub(crate) unconstrained fn decode_partial_note_private_message(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (AztecAddress, Field, Field, Field, Field, BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN>) {
    let note_type_id = msg_metadata as Field; // TODO: make note type id not be a full field

    // The following ensures that the message content contains at least the minimum number of fields required for a
    // valid partial note private message. (Refer to the description of
    // PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NON_NOTE_FIELDS_LEN for more information about these fields.)
    assert(
        msg_content.len() >= PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN,
        f"Invalid private note message: all partial note private messages must have at least {PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN} fields",
    );

    // If PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NON_NOTE_FIELDS_LEN is changed, causing the assertion below to fail, then
    // the destructuring of the partial note private message encoding below must be updated as well.
    std::static_assert(
        PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 4,
        "unexpected value for PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NON_NOTE_FIELDS_LEN",
    );

    // We currently have four fields that are not the partial note's packed representation, which are the owner, the
    // storage slot, the randomness, and the note completion log tag.
    let owner = AztecAddress::from_field(
        msg_content.get(PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_OWNER_INDEX),
    );
    let storage_slot = msg_content.get(PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX);
    let randomness = msg_content.get(PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RANDOMNESS_INDEX);
    let note_completion_log_tag = msg_content.get(PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_NOTE_COMPLETION_LOG_TAG_INDEX);

    let packed_private_note_content: BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN> = array::subbvec(
        msg_content,
        PARTIAL_NOTE_PRIVATE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN,
    );

    (owner, storage_slot, randomness, note_completion_log_tag, note_type_id, packed_private_note_content)
}

mod test {
    use crate::{
        messages::{
            encoding::decode_message,
            logs::partial_note::{decode_partial_note_private_message, encode_partial_note_private_message},
            msg_type::PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
        },
        note::note_interface::NoteType,
    };
    use crate::protocol::{address::AztecAddress, traits::{FromField, Packable}};
    use crate::test::mocks::mock_note::MockNote;

    global VALUE: Field = 7;
    global OWNER: AztecAddress = AztecAddress::from_field(8);
    global STORAGE_SLOT: Field = 9;
    global RANDOMNESS: Field = 10;
    global NOTE_COMPLETION_LOG_TAG: Field = 11;

    #[test]
    unconstrained fn encode_decode() {
        // Note that here we use MockNote as the private fields of a partial note
        let note = MockNote::new(VALUE).build_note();

        let message_plaintext = encode_partial_note_private_message(
            note,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            NOTE_COMPLETION_LOG_TAG,
        );

        let (msg_type_id, msg_metadata, msg_content) = decode_message(BoundedVec::from_array(message_plaintext));

        assert_eq(msg_type_id, PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID);

        let (owner, storage_slot, randomness, note_completion_log_tag, note_type_id, packed_note) =
            decode_partial_note_private_message(msg_metadata, msg_content);

        assert_eq(note_type_id, MockNote::get_id());
        assert_eq(owner, OWNER);
        assert_eq(storage_slot, STORAGE_SLOT);
        assert_eq(randomness, RANDOMNESS);
        assert_eq(note_completion_log_tag, NOTE_COMPLETION_LOG_TAG);
        assert_eq(packed_note, BoundedVec::from_array(note.pack()));
    }
}
