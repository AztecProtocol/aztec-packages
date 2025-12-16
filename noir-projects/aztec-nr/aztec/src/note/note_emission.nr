use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::{note::private_note_to_message_plaintext, utils::prefix_with_tag},
        message_delivery::MessageDelivery,
        offchain_messages::emit_offchain_message,
    },
    note::note_interface::NoteType,
    utils::remove_constraints::remove_constraints_if,
};
use protocol_types::{address::AztecAddress, traits::Packable};

pub struct NoteEmissionContent<Note> {
    // The struct fields are exposed only because of tests.
    pub note: Note,
    pub storage_slot: Field,
    pub note_hash_counter: u32, // a note_hash_counter of 0 means settled
}

/**
 * A note emission struct containing the information required for emitting a note.
 * The exact `emit` logic is passed in by the application code
 */
pub struct NoteEmission<Note> {
    pub content: NoteEmissionContent<Note>,

    // NoteEmission is expected to be constructed when a note is created, which means that the `context` object will be
    // in scope. By storing a reference to it inside this object we remove the need for its methods to receive it,
    // resulting in a cleaner end-user API.
    context: &mut PrivateContext,
}

impl<Note> NoteEmission<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(
        note: Note,
        storage_slot: Field,
        note_hash_counter: u32,
        context: &mut PrivateContext,
    ) -> Self {
        Self { content: NoteEmissionContent { note, storage_slot, note_hash_counter }, context }
    }

    /// Emits a note that can be delivered either via private logs or offchain messages, with configurable encryption and
    /// tagging constraints.
    ///
    /// # Arguments
    /// * `self` - The note emission to emit
    /// * `recipient` - The address that should receive this note
    /// * `delivery_mode` - Controls encryption, tagging, and delivery constraints. Must be a compile-time constant.
    ///   See `MessageDeliveryEnum` for details on the available modes.
    pub fn emit(self, recipient: AztecAddress, delivery_mode: u8) {
        // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when unconstrained
        // usage is requested. If `delivery_mode` were a runtime value then performance would suffer.
        assert_constant(delivery_mode);

        // The following maps out the 3 dimensions across which we configure message delivery.
        let constrained_encryption = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;
        let emit_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
        // TODO(#14565): Add constrained tagging
        let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

        let ciphertext = remove_constraints_if(
            !constrained_encryption,
            || AES128::encrypt(
                private_note_to_message_plaintext(self.content.note, self.content.storage_slot),
                recipient,
            ),
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
            self.context.emit_raw_note_log(log_content, length, self.content.note_hash_counter);
        }
    }

    pub fn discard(_self: Self) {}
}

/**
 * A struct wrapping note emission in `Option<T>`.
 * This is the struct provided to application codes, which can be used to emit
 * only when a note was actually inserted.
 * It is fairly common to have cases where a function conditionally inserts,
 * and this allows us to keep the same API for emission in both cases (e.g. inserting
 * a change note in a token's transfer function only when there is "change" left).
 */
pub struct OuterNoteEmission<Note> {
    pub content_option: Option<NoteEmissionContent<Note>>,

    // OuterNoteEmission is expected to be constructed when a note is created, which means that the `context` object
    // will be in scope. By storing a reference to it inside this object we remove the need for its methods to receive
    // it, resulting in a cleaner end-user API.
    context: &mut PrivateContext,
}

impl<Note> OuterNoteEmission<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(
        content_option: Option<NoteEmissionContent<Note>>,
        context: &mut PrivateContext,
    ) -> Self {
        Self { content_option, context }
    }

    pub fn emit(self, recipient: AztecAddress, delivery_mode: u8) {
        if self.content_option.is_some() {
            NoteEmission { content: self.content_option.unwrap_unchecked(), context: self.context }
                .emit(recipient, delivery_mode);
        }
    }

    pub fn discard(_self: Self) {}
}
