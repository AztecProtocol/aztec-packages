use crate::{
    context::PrivateContext,
    event::event_interface::PrivateLogContent,
    messages::logs::note::{emit_note_as_offchain_message, emit_note_in_private_log},
};
use crate::note::note_interface::NoteType;
use protocol_types::{address::AztecAddress, traits::Packable};

/**
 * A note emission struct containing the information required for emitting a note.
 * The exact `emit` logic is passed in by the application code
 */
pub struct NoteEmission<Note> {
    pub note: Note,
    pub storage_slot: Field,
    pub note_hash_counter: u32, // a note_hash_counter of 0 means settled
}

impl<Note> NoteEmission<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(note: Note, storage_slot: Field, note_hash_counter: u32) -> Self {
        Self { note, storage_slot, note_hash_counter }
    }

    // TODO: Old API to be nuked
    pub fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }

    // TODO: Drop "new" from all the names below
    pub fn emit_new_constrained_in_private_log(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        emit_note_in_private_log(
            self,
            context,
            recipient,
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );
    }

    pub fn emit_new_unconstrained_in_private_log(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        emit_note_in_private_log(self, context, recipient, PrivateLogContent.NO_CONSTRAINTS);
    }

    pub fn emit_new_as_offchain_message(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        emit_note_as_offchain_message(self, context, recipient);
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
    pub emission: Option<NoteEmission<Note>>,
}

impl<Note> OuterNoteEmission<Note>
where
    Note: NoteType + Packable,
{
    pub fn new(emission: Option<NoteEmission<Note>>) -> Self {
        Self { emission }
    }

    // TODO: Old API to be nuked
    pub fn emit<Env>(self, _emit: fn[Env](NoteEmission<Note>) -> ()) {
        if self.emission.is_some() {
            _emit(self.emission.unwrap());
        }
    }

    // TODO: Drop "new" from all the names below
    pub fn emit_new_constrained_in_private_log(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        if self.emission.is_some() {
            self.emission.unwrap_unchecked().emit_new_constrained_in_private_log(context, recipient);
        }
    }

    pub fn emit_new_unconstrained_in_private_log(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        if self.emission.is_some() {
            self.emission.unwrap_unchecked().emit_new_unconstrained_in_private_log(
                context,
                recipient,
            );
        }
    }

    pub fn emit_new_as_offchain_message(
        self,
        context: &mut PrivateContext,
        recipient: AztecAddress,
    ) {
        if self.emission.is_some() {
            self.emission.unwrap_unchecked().emit_new_as_offchain_message(context, recipient);
        }
    }

    pub fn discard(_self: Self) {}
}
