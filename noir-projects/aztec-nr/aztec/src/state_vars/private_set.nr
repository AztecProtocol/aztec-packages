use crate::context::{PrivateContext, PublicContext, UnconstrainedContext};
use crate::note::{
    constants::MAX_NOTES_PER_PAGE,
    lifecycle::{create_note, create_note_hash_from_public, destroy_note_unsafe},
    note_emission::NoteEmission,
    note_getter::{get_notes, view_notes},
    note_getter_options::NoteGetterOptions,
    note_interface::{NoteInterface, NullifiableNote},
    note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_read_request,
};
use crate::state_vars::storage::Storage;
use dep::protocol_types::{
    abis::read_request::ReadRequest,
    constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    traits::{Deserialize, Serialize},
};

// docs:start:struct
pub struct PrivateSet<Note, Context> {
    pub context: Context,
    pub storage_slot: Field,
}
// docs:end:struct

impl<T, Context, let N: u32> Storage<T, N> for PrivateSet<T, Context>
where
    T: Serialize<N> + Deserialize<N>,
{}

impl<Note, Context> PrivateSet<Note, Context> {
    // docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PrivateSet { context, storage_slot }
    }
    // docs:end:new
}

impl<Note, let N: u32> PrivateSet<Note, &mut PublicContext>
where
    Note: NoteInterface<N> + NullifiableNote,
{
    // TODO: This function is still around because of a stale blacklist token. It should most likely be nuked. If you
    // need this functionality use partial notes instead.
    // docs:start:insert_from_public
    pub fn insert_from_public(self, note: &mut Note) {
        create_note_hash_from_public(self.context, self.storage_slot, note);
    }
    // docs:end:insert_from_public
}

impl<Note, let N: u32> PrivateSet<Note, &mut PrivateContext>
where
    Note: NoteInterface<N> + NullifiableNote + Eq,
{
    // docs:start:insert
    pub fn insert(self, note: &mut Note) -> NoteEmission<Note> {
        create_note(self.context, self.storage_slot, note)
    }
    // docs:end:insert

    pub fn pop_notes<PREPROCESSOR_ARGS, FILTER_ARGS>(
        self,
        options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL> {
        let (notes, note_hashes) = get_notes(self.context, self.storage_slot, options);
        // We iterate in a range 0..options.limit instead of 0..notes.len() because options.limit is known at compile
        // time and hence will result in less constraints when set to a lower value than
        // MAX_NOTE_HASH_READ_REQUESTS_PER_CALL.
        for i in 0..options.limit {
            if i < notes.len() {
                let note = notes.get_unchecked(i);
                let note_hash = note_hashes.get_unchecked(i);
                // We immediately destroy the note without doing any of the read request checks `remove` typically
                // performs because we know that the `get_notes` call has already placed those constraints.
                destroy_note_unsafe(self.context, note, note_hash);
            }
        }

        notes
    }

    /// Note that if you obtained the note via `get_notes` it's much better to use `pop_notes` as `pop_notes` results
    /// in significantly less constrains due to avoiding an extra hash and read request check.
    pub fn remove(self, note: Note) {
        let note_hash = compute_note_hash_for_read_request(note);
        let has_been_read =
            self.context.note_hash_read_requests.any(|r: ReadRequest| r.value == note_hash);
        assert(has_been_read, "Can only remove a note that has been read from the set.");

        destroy_note_unsafe(self.context, note, note_hash);
    }

    /// Note that if you later on remove the note it's much better to use `pop_notes` as `pop_notes` results
    /// in significantly less constrains due to avoiding 1 read request check.
    pub fn get_notes<PREPROCESSOR_ARGS, FILTER_ARGS>(
        self,
        options: NoteGetterOptions<Note, N, PREPROCESSOR_ARGS, FILTER_ARGS>,
    ) -> BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL> {
        get_notes(self.context, self.storage_slot, options).0
    }
}

impl<Note, let N: u32> PrivateSet<Note, UnconstrainedContext>
where
    Note: NoteInterface<N> + NullifiableNote,
{
    // docs:start:view_notes
    pub unconstrained fn view_notes(
        self,
        options: NoteViewerOptions<Note, N>,
    ) -> BoundedVec<Note, MAX_NOTES_PER_PAGE> {
        view_notes(self.storage_slot, options)
    }
    // docs:end:view_notes
}
