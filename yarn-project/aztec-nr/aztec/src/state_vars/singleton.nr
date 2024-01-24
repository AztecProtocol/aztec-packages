use dep::std::option::Option;

use dep::protocol_types::{
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
    },
    hash::pedersen_hash,
};

use crate::context::{PrivateContext, PublicContext, Context};
use crate::note::{
    lifecycle::{create_note, destroy_note},
    note_getter::{get_note, view_notes},
    note_interface::NoteInterface,
    note_viewer_options::NoteViewerOptions,
};
use crate::oracle::{
    nullifier_key::get_nullifier_secret_key,
    notes::check_nullifier_exists,
};

// docs:start:struct
struct Singleton<Note, N> {
    context: Option<&mut PrivateContext>,
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
}
// docs:end:struct

impl<Note, N> Singleton<Note, N> {
    // docs:start:new
    pub fn new(
        context: Context,
        storage_slot: Field,
        note_interface: NoteInterface<Note, N>,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self {
            context: context.private,
            storage_slot,
            note_interface,
        }
    }
    // docs:end:new

    // The following computation is leaky - the storage slot can easily be "guessed" by an adversary 
    // by looking at the nullifier in the transaction data. 
    // This is especially dangerous for `maps` because the storage slot is often also identifies the
    // actor that is executing the transaction. e.g, `map.at(msg.sender)` will leak `msg.sender`.
    pub fn compute_initialization_nullifier(self) -> Field {
        pedersen_hash([self.storage_slot], GENERATOR_INDEX__INITIALIZATION_NULLIFIER)
    }

    // docs:start:is_initialized
    unconstrained pub fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }
    // docs:end:is_initialized

    // docs:start:initialize
    pub fn initialize(
        self,
        note: &mut Note,
        broadcast: bool,
    ) {
        let context = self.context.unwrap();

        // Nullify the storage slot.
        let nullifier = self.compute_initialization_nullifier();
        context.push_new_nullifier(nullifier, 0);

        create_note(context, self.storage_slot, note, self.note_interface, broadcast);
    }
    // docs:end:initialize

    // docs:start:replace
    pub fn replace(
        self,
        new_note: &mut Note,
        broadcast: bool,
    ) {
        let context = self.context.unwrap();
        let prev_note = get_note(context, self.storage_slot, self.note_interface);

        // Nullify previous note.
        destroy_note(context, prev_note, self.note_interface);

        // Add replacement note.
        create_note(context, self.storage_slot, new_note, self.note_interface, broadcast);
    }
    // docs:end:replace

    // docs:start:get_note
    pub fn get_note(self, broadcast: bool) -> Note {
        let context = self.context.unwrap();
        let mut note = get_note(context, self.storage_slot, self.note_interface);

        // Nullify current note to make sure it's reading the latest note.
        destroy_note(context, note, self.note_interface);

        // Add the same note again.
        // Because a nonce is added to every note in the kernel, its nullifier will be different.
        create_note(context, self.storage_slot, &mut note, self.note_interface, broadcast);

        note
    }
    // docs:end:get_note

    // docs:start:view_note
    unconstrained pub fn view_note(self) -> Note {
        let options = NoteViewerOptions::new().set_limit(1);
        view_notes(self.storage_slot, self.note_interface, options)[0].unwrap()
    }
    // docs:end:view_note
}
