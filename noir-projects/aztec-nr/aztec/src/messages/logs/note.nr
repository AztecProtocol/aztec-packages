use crate::{
    context::PrivateContext,
    event::event_interface::MessageDelivery,
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        logs::utils::prefix_with_tag,
        msg_type::{PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID},
        offchain_messages::emit_offchain_message,
    },
    note::{note_emission::NoteEmission, note_interface::NoteType},
    utils::remove_constraints::remove_constraints_if,
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

pub fn compute_partial_note_log<Note>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable,
{
    let ciphertext = compute_ciphertext(
        note,
        storage_slot,
        recipient,
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID,
    );

    let log = prefix_with_tag(ciphertext, recipient);

    log
}

fn compute_ciphertext<Note>(
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

/// Emits a note that can be delivered either via private logs or offchain messages, with configurable encryption and
/// tagging constraints.
///
/// # Arguments
/// * `note_emission` - The note emission to emit
/// * `context` - The private context to emit the note in
/// * `recipient` - The address that should receive this note
/// * `delivery_mode` - Controls encryption, tagging, and delivery constraints. Must be a compile-time constant.
///   See `MessageDeliveryEnum` for details on the available modes.
pub fn emit_note<Note>(
    note_emission: NoteEmission<Note>,
    context: &mut PrivateContext,
    recipient: AztecAddress,
    delivery_mode: u8,
)
where
    Note: NoteType + Packable,
{
    // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when unconstrained
    // usage is requested. If `delivery_mode` were a runtime value then performance would suffer.
    assert_constant(delivery_mode);

    let note = note_emission.note;
    let storage_slot = note_emission.storage_slot;
    let note_hash_counter = note_emission.note_hash_counter;

    assert_note_exists(*context, note_hash_counter);

    // The following maps out the 3 dimensions across which we configure message delivery.
    let constrained_encryption = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;
    let emit_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
    // TODO(#14565): Add constrained tagging
    let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

    let ciphertext = remove_constraints_if(
        !constrained_encryption,
        || compute_ciphertext(note, storage_slot, recipient, PRIVATE_NOTE_MSG_TYPE_ID),
    );

    if emit_as_offchain_message {
        emit_offchain_message(ciphertext, recipient);
    } else {
        // Safety: Currently unsafe. See description of CONSTRAINED_ONCHAIN in MessageDeliveryEnum.
        // TODO(#14565): Implement proper constrained tag prefixing to make this truly CONSTRAINED_ONCHAIN
        let log_content = prefix_with_tag(ciphertext, recipient);

        // Regardless of the original note size `N`, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = log_content.len();
        context.emit_raw_note_log(log_content, length, note_hash_counter);
    }
}
