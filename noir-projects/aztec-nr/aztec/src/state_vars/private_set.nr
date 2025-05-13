use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    constants::MAX_NOTES_PER_PAGE,
    lifecycle::{create_note, destroy_note_unsafe},
    note_emission::NoteEmission,
    note_getter::{get_notes, view_notes},
    note_getter_options::NoteGetterOptions,
    note_interface::{NoteHash, NoteType},
    note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_read_request,
};
use crate::note::retrieved_note::RetrievedNote;
use crate::state_vars::storage::Storage;
use dep::protocol_types::{
    abis::read_request::ReadRequest, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    traits::Packable,
};

mod test;

// docs:start:struct
pub struct PrivateSet<Note, Context> {
    pub context: Context,
    pub storage_slot: Field,
}
// docs:end:struct

// Private storage slots are not really 'slots' but rather a value in the note hash preimage, so there is no notion of a
// value spilling over multiple slots. For this reason PrivateSet (and all other private state variables) needs just one
// slot to be reserved, regardless of what it stores.
impl<T, Context> Storage<1> for PrivateSet<T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateSet<Note, Context> {
    // docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PrivateSet { context, storage_slot }
    }
    // docs:end:new
}

impl<Note> PrivateSet<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash + Eq,
{
    // docs:start:insert
    pub fn insert<let N: u32>(self, note: Note) -> NoteEmission<Note>
    where
        Note: Packable<N>,
    {
        create_note(self.context, self.storage_slot, note)
    }
    // docs:end:insert

    pub fn pop_notes<PREPROCESSOR_ARGS, FILTER_ARGS, let N: u32>(
        self,
        options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    where
        Note: Packable<N>,
    {
        let (retrieved_notes, note_hashes) = get_notes(self.context, self.storage_slot, options);
        // We iterate in a range 0..options.limit instead of 0..notes.len() because options.limit is known at compile
        // time and hence will result in less constraints when set to a lower value than
        // MAX_NOTE_HASH_READ_REQUESTS_PER_CALL.
        for i in 0..options.limit {
            if i < retrieved_notes.len() {
                let retrieved_note = retrieved_notes.get_unchecked(i);
                let note_hash = note_hashes.get_unchecked(i);
                // We immediately destroy the note without doing any of the read request checks `remove` typically
                // performs because we know that the `get_notes` call has already placed those constraints.
                destroy_note_unsafe(self.context, retrieved_note, note_hash);
            }
        }

        // Since the notes were already destroyed, we no longer need the additional data in RetrievedNote and can
        // discard it.
        retrieved_notes.map(|retrieved_note| retrieved_note.note)
    }

    /// Note that if you obtained the note via `get_notes` it's much better to use `pop_notes` as `pop_notes` results
    /// in significantly less constrains due to avoiding an extra hash and read request check.
    pub fn remove(self, retrieved_note: RetrievedNote<Note>) {
        let note_hash = compute_note_hash_for_read_request(retrieved_note, self.storage_slot);
        let has_been_read =
            self.context.note_hash_read_requests.any(|r: ReadRequest| r.value == note_hash);
        assert(has_been_read, "Can only remove a note that has been read from the set.");

        destroy_note_unsafe(self.context, retrieved_note, note_hash);
    }

    /// Note that if you later on remove the note it's much better to use `pop_notes` as `pop_notes` results
    /// in significantly less constrains due to avoiding 1 read request check.
    pub fn get_notes<PREPROCESSOR_ARGS, FILTER_ARGS, let N: u32>(
        self,
        options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> BoundedVec<RetrievedNote<Note>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    where
        Note: Packable<N>,
    {
        get_notes(self.context, self.storage_slot, options).0
    }
}

impl<Note> PrivateSet<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    // docs:start:view_notes
    pub unconstrained fn view_notes<let N: u32>(
        self,
        options: NoteViewerOptions<Note, N>,
    ) -> BoundedVec<Note, MAX_NOTES_PER_PAGE>
    where
        Note: Packable<N>,
    {
        view_notes(self.storage_slot, options)
    }
    // docs:end:view_notes
}
