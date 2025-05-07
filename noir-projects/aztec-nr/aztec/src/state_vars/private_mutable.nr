use dep::protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    lifecycle::{create_note, destroy_note_unsafe},
    note_emission::NoteEmission,
    note_getter::{get_note, view_notes},
    note_interface::{NoteHash, NoteType},
    note_viewer_options::NoteViewerOptions,
};
use crate::note::retrieved_note::RetrievedNote;
use crate::oracle::notes::check_nullifier_exists;
use crate::state_vars::storage::Storage;

// docs:start:struct
pub struct PrivateMutable<Note, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:struct

mod test;

// Private storage slots are not really 'slots' but rather a value in the note hash preimage, so there is no notion of a
// value spilling over multiple slots. For this reason PrivateMutable (and all other private state variables) needs just
// one slot to be reserved, regardless of what it stores.
impl<T, Context> Storage<1> for PrivateMutable<T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateMutable<Note, Context> {
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
    // This is especially dangerous for initial assignment to elements of a `Map<AztecAddress, PrivateMutable>` type (for example), because the storage slot often also identifies an actor. e.g.
    // the initial assignment to `my_map.at(msg.sender)` will leak: `msg.sender`, the fact that an element of `my_map` was assigned-to for the first time, and the contract_address.
    // Note: subsequent nullification of this state variable, via the `replace` method will not be leaky, if the `compute_nullifier()` method of the underlying note is designed to ensure privacy.
    // For example, if the `compute_nullifier()` method injects the secret key of a note owner into the computed nullifier's preimage.
    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateMutable<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    // docs:start:initialize
    pub fn initialize<let N: u32>(self, note: Note) -> NoteEmission<Note>
    where
        Note: Packable<N>,
    {
        // Nullify the storage slot.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.storage_slot, note)
    }
    // docs:end:initialize

    // docs:start:replace
    pub fn replace<let N: u32>(self, new_note: Note) -> NoteEmission<Note>
    where
        Note: Packable<N>,
    {
        let (prev_retrieved_note, note_hash_for_read_request): (RetrievedNote<Note>, Field) =
            get_note(self.context, self.storage_slot);

        // Nullify previous note.
        destroy_note_unsafe(
            self.context,
            prev_retrieved_note,
            note_hash_for_read_request,
        );

        // Add replacement note.
        create_note(self.context, self.storage_slot, new_note)
    }
    // docs:end:replace

    pub fn initialize_or_replace<let N: u32>(self, note: Note) -> NoteEmission<Note>
    where
        Note: Packable<N>,
    {
        // Safety: `check_nullifier_exists` is an unconstrained function - we can constrain a true value
        // by providing an inclusion proof of the nullifier, but cannot constrain a false value since
        // a non-inclusion proof would only be valid if done in public.
        // Ultimately, this is not an issue given that we'll either:
        //  - initialize the state variable, which would fail if it was already initialized due to the duplicate
        //    nullifier, or
        //  - replace the current value, which would fail if it was not initialized since we wouldn't be able
        //    to produce an inclusion proof for the current note
        // This means that an honest oracle will assist the prover to produce a valid proof, while a malicious
        // oracle (i.e. one that returns an incorrect value for is_initialized) will simply fail to produce
        // a proof.
        let is_initialized =
            unsafe { check_nullifier_exists(self.compute_initialization_nullifier()) };

        if (!is_initialized) {
            self.initialize(note)
        } else {
            self.replace(note)
        }
    }

    // docs:start:get_note
    pub fn get_note<let N: u32>(self) -> NoteEmission<Note>
    where
        Note: Packable<N>,
    {
        let mut (retrieved_note, note_hash_for_read_request) =
            get_note(self.context, self.storage_slot);

        // Nullify current note to make sure it's reading the latest note.
        destroy_note_unsafe(self.context, retrieved_note, note_hash_for_read_request);

        // Add the same note again.
        // Because a nonce is added to every note in the kernel, its nullifier will be different.
        create_note(self.context, self.storage_slot, retrieved_note.note)
    }
    // docs:end:get_note
}

impl<Note> PrivateMutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    // docs:start:view_note
    pub unconstrained fn view_note<let N: u32>(self) -> Note
    where
        Note: Packable<N>,
    {
        let mut options = NoteViewerOptions::new();
        view_notes(self.storage_slot, options.set_limit(1)).get(0)
    }
    // docs:end:view_note
}
