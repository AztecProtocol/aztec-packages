use crate::{
    context::PrivateContext,
    messages::{logs::note::encode_private_note_message, message_delivery::do_private_message_delivery},
    note::{lifecycle::NewNote, note_interface::NoteType},
};
use crate::protocol::{address::AztecAddress, traits::Packable};

/// A message with information about a note that was created in the current contract call. This message **MUST** be
/// delivered to a recipient in order to not lose the private note information.
///
/// Use [`NoteMessage::deliver`] to select a delivery mechanism. The same message can be delivered to multiple
/// recipients.
#[must_use = "Unused NoteMessage result - use the `deliver` function to prevent the note information from being lost forever"]
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
    /// The `delivery_mode` must be one of [`crate::messages::message_delivery::MessageDeliveryEnum`], and will inform
    /// costs (both proving time and TX fees) as well as delivery guarantees. This value must be a compile-time
    /// constant.
    ///
    /// To deliver the message to a recipient that is not the note's owner, use [`deliver_to`](NoteMessage::deliver_to)
    /// instead.
    ///
    /// ## Invalid Recipients
    ///
    /// If the note's owner is an invalid address, then a random public key is selected and message delivery continues
    /// as normal. This prevents both 'king of the hill' attacks (where a sender would otherwise fail to deliver a note
    /// to an invalid recipient) and forced privacy leaks (where an invalid recipient results in a unique transaction
    /// fingerprint, e.g. one lacking the private logs that would correspond to message delivery).
    pub fn deliver(self, delivery_mode: u8) {
        self.deliver_to(self.new_note.owner, delivery_mode);
    }

    /// Same as [`deliver`](NoteMessage::deliver), except the message gets delivered to an arbitrary `recipient`
    /// instead
    /// of the note owner.
    ///
    /// Note that `recipient` getting the message does not let them **use** the note, it only means that thy will know
    /// about it, including the transaction in which it was created, and prove it exists. They will also not be able to
    /// know when or if the note is used (i.e. nullified), assuming the standard note nullifier function.
    ///
    /// ## Use Cases
    ///
    /// This feature enables many design patterns that diverge in how notes are traditionally handled. For example, an
    /// institutional contract may require to have some actor receive all notes created for compliance purposes. Or a
    /// low value application like a game might deliver all notes offchain to a centralized server that then serves
    /// them via the app, bypassing the need for contract sync and improving UX.
    pub fn deliver_to(self, recipient: AztecAddress, delivery_mode: u8) {
        // Technical note: we're about to call a closure that needs access to `new_note`, but we can't pass `self` to
        // it because the closure might execute in unconstrained mode, and since `self` contains a mutable reference to
        // `context` this would cause for a mutable reference to cross the constrained-unconstrained barrier, which is
        // not allowed. As a workaround, we create a variable without the context and capture that instead.
        let new_note = self.new_note;

        do_private_message_delivery(
            self.context,
            || encode_private_note_message(
                new_note.note,
                new_note.owner,
                new_note.storage_slot,
                new_note.randomness,
            ),
            Option::some(self.new_note.note_hash_counter),
            recipient,
            delivery_mode,
        );
    }

    /// Returns the note contained in the message.
    pub fn get_note(self) -> Note {
        self.new_note.note
    }

    /// Returns the [`NewNote`] container in the message.
    ///
    /// This is an advanced function, typically needed only when creating new kinds of state variables that need to
    /// create [`MaybeNoteMessage`] values.
    pub fn get_new_note(self) -> NewNote<Note> {
        self.new_note
    }
}

/// Same as [`NoteMessage`], except this type also handles the possibility where the note may not have been actually
/// created depending on runtime conditions (e.g. a token transfer change note is not created if there is no change).
///
/// Other than that, it and [`MaybeNoteMessage::deliver`] behave the exact same way as [`NoteMessage`].
#[must_use = "Unused NoteMessage result - use the `deliver` function to prevent the note information from being lost forever"]
pub struct MaybeNoteMessage<Note> {
    // We can't simply create an `Option` of `NoteMessage` because that type includes a mutable reference to the
    // `context`. All `Option` methods (map, or, etc.) have if-else expressions in which they might return the
    // contents, and conditionally returning mutable references is disallowed by Noir. Hence, we create this type which
    // only holds `NewNote` in the `Option`, keeping the `context` out.
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

    /// Same as [`NoteMessage::deliver`], except the message will only be delivered if it actually exists.
    ///
    /// Messages delivered using [`crate::messages::message_delivery::MessageDeliveryEnum::ONCHAIN_CONSTRAINED`] will
    /// pay
    /// proving costs regardless of whether the message exists or not.
    pub fn deliver(self, delivery_mode: u8) {
        if self.maybe_new_note.is_some() {
            NoteMessage::new(self.maybe_new_note.unwrap_unchecked(), self.context).deliver(delivery_mode);
        }
    }

    /// Same as [`NoteMessage::deliver_to`], except the message will only be delivered if it actually exists.
    ///
    /// Messages delivered using [`crate::messages::message_delivery::MessageDeliveryEnum::ONCHAIN_CONSTRAINED`] will
    /// pay
    /// proving costs regardless of whether the message exists or not.
    pub fn deliver_to(self, recipient: AztecAddress, delivery_mode: u8) {
        if self.maybe_new_note.is_some() {
            NoteMessage::new(self.maybe_new_note.unwrap_unchecked(), self.context).deliver_to(recipient, delivery_mode);
        }
    }

    /// Returns the note contained in the message.
    pub fn get_note(self) -> Option<Note> {
        self.maybe_new_note.map(|new_note| new_note.note)
    }
}
