use dep::std::option::Option;
use dep::protocol_types::{
    address::AztecAddress,
    traits::{Serialize, Deserialize},
};

use crate::context::{PrivateContext, Context};
use crate::note::{
    lifecycle::create_note,
    note_getter::{get_note, view_notes},
    note_interface::NoteInterface,
    note_viewer_options::NoteViewerOptions,
};
use crate::oracle::notes::check_nullifier_exists;
use crate::state_vars::singleton::compute_singleton_initialization_nullifier;

// docs:start:struct
struct ImmutableSingleton<Note> {
    context: Option<&mut PrivateContext>,
    storage_slot: Field,
    compute_initialization_nullifier: fn (Field, Option<AztecAddress>, Option<&mut PrivateContext>) -> Field,
}
// docs:end:struct

impl<Note> ImmutableSingleton<Note> {
    // docs:start:new
    pub fn new(
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        ImmutableSingleton {
            context: context.private,
            storage_slot,
            compute_initialization_nullifier: compute_singleton_initialization_nullifier,
        }
    }
    // docs:end:new

    // docs:start:is_initialized
    unconstrained pub fn is_initialized(self, owner: Option<AztecAddress>) -> bool {
        let compute_initialization_nullifier = self.compute_initialization_nullifier;
        let nullifier = compute_initialization_nullifier(self.storage_slot, owner, Option::none());
        check_nullifier_exists(nullifier)
    }
    // docs:end:is_initialized

    // docs:start:initialize
    pub fn initialize<N>(
        self,
        note: &mut Note, 
        owner: Option<AztecAddress>,
        broadcast: bool,
    ) where Note: NoteInterface + Serialize<N> + Deserialize<N> {
        let context = self.context.unwrap();

        // Nullify the storage slot.
        let compute_initialization_nullifier = self.compute_initialization_nullifier;
        let nullifier = compute_initialization_nullifier(self.storage_slot, owner, self.context);
        context.push_new_nullifier(nullifier, 0);

        create_note(
            context,
            self.storage_slot,
            note,
            broadcast,
        );
    }
    // docs:end:initialize

    // docs:start:get_note
    pub fn get_note<N>(self) -> Note where Note: NoteInterface + Deserialize<N> {
        let context = self.context.unwrap();
        let storage_slot = self.storage_slot;
        get_note(context, storage_slot)
    }
    // docs:end:get_note

    // docs:start:view_note
    unconstrained pub fn view_note<N>(self) -> Note  where Note: NoteInterface + Deserialize<N> {
        // TODO: Remove this once https://github.com/noir-lang/noir/issues/4088 is fixed
        let _deserialized_length_hint: [Field; N] = Note::_deserialized_length_hint();
        let options = NoteViewerOptions::new().set_limit(1);
        view_notes(self.storage_slot, options)[0].unwrap()
    }
    // docs:end:view_note
}
