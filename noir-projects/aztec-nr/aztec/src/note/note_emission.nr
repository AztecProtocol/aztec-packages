use crate::{
    context::PrivateContext, messages::logs::note::emit_note, note::note_interface::NoteType,
};
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

    pub fn emit(self, context: &mut PrivateContext, recipient: AztecAddress, delivery_mode: u8) {
        emit_note(self, context, recipient, delivery_mode);
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

    pub fn emit(self, context: &mut PrivateContext, recipient: AztecAddress, delivery_mode: u8) {
        if self.emission.is_some() {
            self.emission.unwrap_unchecked().emit(context, recipient, delivery_mode);
        }
    }

    pub fn discard(_self: Self) {}
}
