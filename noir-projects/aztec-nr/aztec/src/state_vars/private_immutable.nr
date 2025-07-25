use dep::protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    lifecycle::create_note,
    note_emission::NoteEmission,
    note_getter::{get_note, view_notes},
    note_interface::{NoteHash, NoteType},
    note_viewer_options::NoteViewerOptions,
};
use crate::oracle::notes::check_nullifier_exists;
use crate::state_vars::storage::HasStorageSlot;

// docs:start:struct
pub struct PrivateImmutable<Note, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:struct

// Private storage slots are not really 'slots' but rather a value in the note hash preimage, so there is no notion of a
// value spilling over multiple slots. For this reason PrivateImmutable (and all other private state variables) needs
// just one slot to be reserved, regardless of what it stores.
impl<T, Context> HasStorageSlot<1> for PrivateImmutable<T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateImmutable<Note, Context> {
    // docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }
    // docs:end:new

    // The following computation is leaky, in that it doesn't hide the storage slot that has been initialized, nor does it hide the contract address of this contract.
    // When this initialization nullifier is emitted, an observer could do a dictionary or rainbow attack to learn the preimage of this nullifier to deduce the storage slot and contract address.
    // For some applications, leaking the details that a particular state variable of a particular contract has been initialized will be unacceptable.
    // Under such circumstances, such application developers might wish to _not_ use this state variable type.
    // This is especially dangerous for initial assignment to elements of a `Map<AztecAddress, PrivateImmutable>` type (for example), because the storage slot often also identifies an actor.
    // e.g. the initial assignment to `my_map.at(msg.sender)` will leak: `msg.sender`, the fact that an element of `my_map` was assigned-to for the first time, and the contract_address.
    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateImmutable<Note, &mut PrivateContext> {
    // docs:start:initialize
    pub fn initialize(self, note: Note) -> NoteEmission<Note>
    where
        Note: NoteType + NoteHash + Packable,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.storage_slot, note)
    }
    // docs:end:initialize

    // docs:start:get_note
    pub fn get_note(self) -> Note
    where
        Note: NoteType + NoteHash + Packable,
    {
        let storage_slot = self.storage_slot;
        let retrieved_note = get_note(self.context, storage_slot).0;

        // Because the notes obtained from PrivateImmutable are not meant to be nullified and get_note(...) function
        // has already constrained the note (by pushing a read request to the context), we can return just the note
        // and skip the additional data in RetrievedNote.
        retrieved_note.note
    }
    // docs:end:get_note
}

impl<Note> PrivateImmutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    // docs:start:is_initialized
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }
    // docs:end:is_initialized

    // view_note does not actually use the context, but it calls oracles that are only available in private
    // docs:start:view_note
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        let mut options = NoteViewerOptions::<Note, <Note as Packable>::N>::new();
        view_notes(self.storage_slot, options.set_limit(1)).get(0)
    }
    // docs:end:view_note
}
