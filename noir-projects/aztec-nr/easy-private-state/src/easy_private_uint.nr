use dep::aztec::{
    context::PrivateContext,
    messages::logs::note::encode_and_encrypt_note,
    note::note_getter_options::NoteGetterOptions,
    protocol_types::address::AztecAddress,
    state_vars::{PrivateSet, storage::Storage},
};
use dep::value_note::{filter::filter_notes_min_sum, value_note::ValueNote};

pub struct EasyPrivateUint<Context> {
    context: Context,
    set: PrivateSet<ValueNote, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> Storage<1> for EasyPrivateUint<Context> {
    fn get_storage_slot(self) -> Field {
        self.set.get_storage_slot()
    }
}

// Holds a note that can act similarly to an int.
impl<Context> EasyPrivateUint<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        EasyPrivateUint { context, set: PrivateSet::new(context, storage_slot) }
    }
}

impl EasyPrivateUint<&mut PrivateContext> {
    // Very similar to `value_note::utils::increment`.
    pub fn add(self, addend: u64, owner: AztecAddress, sender: AztecAddress) {
        // Creates new note for the owner.
        let addend_note = ValueNote::new(addend as Field, owner);

        // Insert the new note to the owner's set of notes.
        // docs:start:insert
        self.set.insert(addend_note).emit(encode_and_encrypt_note(self.context, owner, sender));
        // docs:end:insert
    }

    // Very similar to `value_note::utils::decrement`.
    pub fn sub(self, subtrahend: u64, owner: AztecAddress, sender: AztecAddress) {
        // docs:start:pop_notes
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend as Field);
        let notes = self.set.pop_notes(options);
        // docs:end:pop_notes
        let mut minuend: u64 = 0;
        for i in 0..options.limit {
            if i < notes.len() {
                let note = notes.get_unchecked(i);

                minuend += note.value() as u64;
            }
        }

        assert(minuend >= subtrahend);

        // Creates change note for the owner.
        let result_value = minuend - subtrahend;
        let result_note = ValueNote::new(result_value as Field, owner);
        self.set.insert(result_note).emit(encode_and_encrypt_note(self.context, owner, sender));
    }
}
