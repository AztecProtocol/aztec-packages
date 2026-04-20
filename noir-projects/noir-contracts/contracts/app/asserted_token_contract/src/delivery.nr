use super::{asserted_note::AssertedNote, effects::emit_insertion_effect, validation::validate_note};
use aztec::{
    context::PrivateContext,
    ephemeral::EphemeralArray,
    messages::{
        discovery::private_notes::process_private_note_msg,
        encoding::{encode_message, MAX_MESSAGE_CONTENT_LEN},
        logs::note::MAX_NOTE_PACKED_LEN,
        message_delivery::{do_private_message_delivery, MessageDelivery},
        msg_type::custom_msg_type_id,
        processing::{MessageContext, NoteValidationRequest},
    },
    note::{note_interface::{NoteHash, NoteType}, NoteMessage},
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Packable, ToField}},
    utils::array::subarray,
};

global PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN: u32 = 3;

global PRIVATE_NOTE_MSG_PLAINTEXT_OWNER_INDEX: u32 = 0;
global PRIVATE_NOTE_MSG_PLAINTEXT_STORAGE_SLOT_INDEX: u32 = 1;
global PRIVATE_NOTE_MSG_PLAINTEXT_RANDOMNESS_INDEX: u32 = 2;

global MESSAGE_EXPANDED_METADATA_LEN: u32 = 1;

global ASSERTED_NOTE_MSG_TYPE_ID: u64 = custom_msg_type_id(0);

fn encode_asserted_note_message<Note>(
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
    encode_message(
        ASSERTED_NOTE_MSG_TYPE_ID,
        Note::get_id() as u64,
        msg_content,
    )
}

pub fn deliver(context: &mut PrivateContext, message: NoteMessage<AssertedNote>) {
    let new_note = message.get_new_note();

    do_private_message_delivery(
        context,
        || encode_asserted_note_message(
            new_note.note,
            new_note.owner,
            new_note.storage_slot,
            new_note.randomness,
        ),
        Option::some(new_note.note_hash_counter),
        new_note.owner,
        MessageDelivery.ONCHAIN_UNCONSTRAINED,
    );

    // Safety: Offchain effects are by definition unconstrained.
    unsafe {
        emit_insertion_effect(
            new_note.note.amount,
            new_note.owner,
            new_note.note.randomness,
            new_note.storage_slot,
        )
    };
}

unconstrained fn compute_asserted_note_hash(
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    owner: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    _contract_address: AztecAddress,
    randomness: Field,
) -> Option<Field> {
    if (note_type_id == AssertedNote::get_id())
        & (packed_note.len() == <AssertedNote as Packable>::N) {
        let note = AssertedNote::unpack(subarray(packed_note.storage(), 0));
        Option::some(note.compute_note_hash(owner, storage_slot, randomness))
    } else {
        Option::none()
    }
}

unconstrained fn compute_asserted_note_nullifier(
    unique_note_hash: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    owner: AztecAddress,
    _storage_slot: Field,
    note_type_id: Field,
    _contract_address: AztecAddress,
    _randomness: Field,
) -> Option<Field> {
    if (note_type_id == AssertedNote::get_id())
        & (packed_note.len() == <AssertedNote as Packable>::N) {
        let note = AssertedNote::unpack(subarray(packed_note.storage(), 0));
        note.compute_nullifier_unconstrained(owner, unique_note_hash)
    } else {
        Option::none()
    }
}

global NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

pub unconstrained fn note_handler(
    contract_address: AztecAddress,
    msg_type_id: u64,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    message_context: MessageContext,
    _scope: AztecAddress,
) {
    // Evaluate if we should delete this assertion
    assert(msg_type_id == ASSERTED_NOTE_MSG_TYPE_ID);

    let discovered_notes: EphemeralArray<NoteValidationRequest> =
        EphemeralArray::at(NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT);
    let len_before = discovered_notes.len();

    process_private_note_msg(
        contract_address,
        message_context.tx_hash,
        message_context.unique_note_hashes_in_tx,
        message_context.first_nullifier_in_tx,
        compute_asserted_note_hash,
        compute_asserted_note_nullifier,
        msg_metadata,
        msg_content,
    );

    let notes_discovered = discovered_notes.len() - len_before;
    aztec::protocol::logging::debug_log_format(
        "Found {0} notes after processing",
        [notes_discovered as Field],
    );
    if notes_discovered > 1 {
        // Delete all, we don't allow one log discovering multiple notes.
        for _ in 0..notes_discovered {
            let _deleted = discovered_notes.pop();
        }
    } else if notes_discovered == 1 {
        // Delete, will readd if valid.
        let note_validation_request = discovered_notes.pop();

        if validate_note(
            AssertedNote::unpack(subarray(note_validation_request.packed_note.storage(), 0)),
            contract_address,
            note_validation_request.storage_slot,
            note_validation_request.owner,
            message_context.tx_hash,
        ) {
            discovered_notes.push(note_validation_request);
        }
    }
}
