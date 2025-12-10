use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::{note::private_note_to_message_plaintext, utils::prefix_with_tag},
        message_delivery::MessageDelivery,
        offchain_messages::deliver_offchain_message,
    },
    note::{lifecycle::NewNote, note_interface::NoteType},
    utils::remove_constraints::remove_constraints_if,
};
use protocol_types::{address::AztecAddress, traits::Packable};

/// A message with information about a note that has just been created. This message **MUST** be delivered to a
/// recipient in order to not lose the private note information.
///
/// Use [NoteMessage::deliver] to select a delivery mechanism. The same message can be delivered to multiple
/// recipients.
pub struct NoteMessage<Note> {
    pub(crate) new_note: NewNote<Note>,

    // NoteMessage is constructed when a note is created, which means that the `context` object will be in scope. By
    // storing a reference to it inside this object we remove the need for its methods to receive it, resulting in a
    // cleaner end-user API.
    context: &mut PrivateContext,
}

impl<Note> NoteMessage<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(new_note: NewNote<Note>, context: &mut PrivateContext) -> Self {
        Self { new_note, context }
    }

    /// Delivers the note message to its owner, providing them access to the private note information.
    ///
    /// The message is first encrypted to the owner's public key, ensuring no other actor can read it.
    ///
    /// The `delivery_mode` must be one of [crate::messages::message_delivery::MessageDeliveryEnum], and will inform
    /// costs (both proving time and TX fees) as well as delivery guarantees. This value must be a compile-time
    /// constant.
    ///
    /// To deliver the message to a recipient that is not the note's owner, use [NoteMessage::deliver_to] instead.
    ///
    /// # Invalid Recipients
    ///
    /// If the note's owner is an invalid address, then a random public key is selected and message delivery continues
    /// as normal. This prevents both 'king of the hill' attacks (where a sender would otherwise fail to deliver a note
    /// to an invalid recipient) and forced privacy leaks (where an invalid recipient results in a unique transaction
    /// fingerprint, e.g. one lacking the private logs that would correspond to message delivery).
    pub fn deliver(self, delivery_mode: u8) {
        self.deliver_to(self.new_note.owner, delivery_mode);
    }

    /// Same as [NoteMessage::deliver], except the message gets delivered to an arbitrary `recipient` instead of the
    /// note owner.
    ///
    /// Note that `recipient` getting the message does not let them **use** the note, it only means that thy will know
    /// about it, including the transaction in which it was created, and prove it exists. They will also not be able to
    /// know when or if the note is used (i.e. nullified), assuming the standard note nullifier function.
    ///
    /// # Use Cases
    ///
    /// This feature enables many design patterns that diverge in how notes are traditionally handled. For example,
    /// an institutional contract may require to have some actor receive all notes created for compliance purposes. Or a
    /// low value application like a game might deliver all notes offchain to a centralized server that then serves them
    /// via the app, bypassing the need for contract sync and improving UX.
    pub fn deliver_to(self, recipient: AztecAddress, delivery_mode: u8) {
        // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when
        // unconstrained usage is requested. If `delivery_mode` were a runtime value the compiler would be unable to
        // perform dead-code elimination.
        assert_constant(delivery_mode);

        // The following maps out the 3 dimensions across which we configure message delivery.
        let constrained_encryption = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;
        let deliver_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
        // TODO(#14565): Add constrained tagging
        let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

        // Technical note: we're about to call a closure that needs access to `new_note`, but we can't pass `self` to it
        // because the closure might execute in unconstrained mode, and since `self` contains a mutable reference to
        // `context` this would cause for a mutable reference to cross the constrained-unconstrained barrier, which is
        // not allowed. As a workaround, we create a variable without the context and capture that instead.
        let new_note = self.new_note;

        let ciphertext = remove_constraints_if(
            !constrained_encryption,
            || AES128::encrypt(
                private_note_to_message_plaintext(
                    new_note.note,
                    new_note.owner,
                    new_note.storage_slot,
                    new_note.randomness,
                ),
                recipient,
            ),
        );

        if deliver_as_offchain_message {
            deliver_offchain_message(ciphertext, recipient);
        } else {
            // Onchain messages are delivered via private logs, which must be prefixed with a tag such that the
            // recipient will know to fetch and decrypt them.

            // Safety: Currently unsafe. See description of CONSTRAINED_ONCHAIN in messages::MessageDeliveryEnum.
            // TODO(#14565): Implement proper constrained tag prefixing to make this truly CONSTRAINED_ONCHAIN
            let log_content = prefix_with_tag(ciphertext, recipient);

            // We associate the log with the new note's side effect counter, so that if the note ends up being squashed
            // in the current transaction, the log will be removed as well.
            //
            // Note that the log always has the same length regardless of the [Note] type, because all
            // message ciphertexts also have the same length. This prevents accidental privacy leakage via the log length.
            self.context.emit_raw_note_log(
                log_content,
                log_content.len(),
                new_note.note_hash_counter,
            );
        }
    }

    /// Returns the note contained in the message.
    pub fn get_note(self) -> Note {
        self.new_note.note
    }

    /// Returns the [NewNote] container in the message.
    ///
    /// This is an advanced function, typically needed only when creating new kinds of state variables that need to
    /// create [MaybeNoteMessage] values.
    pub fn get_new_note(self) -> NewNote<Note> {
        self.new_note
    }
}

/// Same as [NoteMessage], except this type also handles the possibility where the note may not have been actually
/// created depending on runtime conditions (e.g. a token transfer change note is not created if there is no change).
/// Other than that, it and [MaybeNoteMessage::delivery] behave the exact same way as [NoteMessage].
pub struct MaybeNoteMessage<Note> {
    // We can't simply create an `Option` of `NoteMessage` because that type includes a mutable reference to the
    // `context`. All `Option` methods (map, or, etc.) have if-else expressions in which they might return the contents,
    // and conditionally returning mutable references is disallowed by Noir. Hence, we create this type which only holds
    // `NewNote` in the `Option`, keeping the `context` out.
    maybe_new_note: Option<NewNote<Note>>,

    // MaybeNoteMessage is expected to be constructed when a note is created, which means that the `context` object
    // will be in scope. By storing a reference to it inside this object we remove the need for its methods to receive
    // it, resulting in a cleaner end-user API.
    context: &mut PrivateContext,
}

impl<Note> MaybeNoteMessage<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(maybe_new_note: Option<NewNote<Note>>, context: &mut PrivateContext) -> Self {
        Self { maybe_new_note, context }
    }

    /// Same as [NoteMessage::deliver], except the message will only be delivered if it actually exists.
    ///
    /// Messages delivered using [crate::messages::message_delivery::MessageDeliveryEnum::CONSTRAINED_ONCHAIN] will pay
    /// proving costs regardless of whether the message exists or not.
    pub fn deliver(self, delivery_mode: u8) {
        if self.maybe_new_note.is_some() {
            NoteMessage::new(self.maybe_new_note.unwrap_unchecked(), self.context).deliver(
                delivery_mode,
            );
        }
    }

    /// Same as [NoteMessage::deliver_to], except the message will only be delivered if it actually exists.
    ///
    /// Messages delivered using [crate::messages::message_delivery::MessageDeliveryEnum::CONSTRAINED_ONCHAIN] will pay
    /// proving costs regardless of whether the message exists or not.
    pub fn deliver_to(self, recipient: AztecAddress, delivery_mode: u8) {
        if self.maybe_new_note.is_some() {
            NoteMessage::new(self.maybe_new_note.unwrap_unchecked(), self.context).deliver_to(
                recipient,
                delivery_mode,
            );
        }
    }

    /// Returns the note contained in the message.
    pub fn get_note(self) -> Option<Note> {
        self.maybe_new_note.map(|new_note| new_note.note)
    }
}
