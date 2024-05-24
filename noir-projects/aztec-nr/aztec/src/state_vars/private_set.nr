use dep::protocol_types::{
    constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, abis::read_request::ReadRequest,
    grumpkin_point::GrumpkinPoint
};
use crate::context::{PrivateContext, PublicContext};
use crate::note::{
    constants::MAX_NOTES_PER_PAGE, lifecycle::{create_note, create_note_hash_from_public, destroy_note},
    note_getter::{get_notes, view_notes}, note_getter_options::{NoteGetterOptions, NoteStatus},
    note_header::NoteHeader, note_interface::NoteInterface, note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_read_request
};
use crate::state_vars::storage::Storage;

// docs:start:struct
struct PrivateSet<Note, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:struct

impl<T, Context> Storage<T> for PrivateSet<T, Context> {}

impl<Note, Context> PrivateSet<Note, Context> {
    // docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PrivateSet { context, storage_slot }
    }
    // docs:end:new
}

impl<Note> PrivateSet<Note, &mut PublicContext> {
    // docs:start:insert_from_public
    pub fn insert_from_public<N, M>(self, note: &mut Note) where Note: NoteInterface<N, M> {
        create_note_hash_from_public(self.context, self.storage_slot, note);
    }
    // docs:end:insert_from_public
}

impl<Note> PrivateSet<Note, &mut PrivateContext> {
    // docs:start:insert
    pub fn insert<N, M>(
        self,
        note: &mut Note,
        broadcast: bool,
        ivpk_m: GrumpkinPoint
    ) where Note: NoteInterface<N, M> {
        create_note(self.context, self.storage_slot, note, broadcast, ivpk_m);
    }
    // docs:end:insert

    // DEPRECATED
    fn assert_contains_and_remove(_self: Self, _note: &mut Note, _nonce: Field) {
        assert(
            false, "`assert_contains_and_remove` has been deprecated. Please call PXE.addNote() to add a note to the database. Then use PrivateSet.get_notes() in your contract to verify and remove a note."
        );
    }

    // DEPRECATED
    fn assert_contains_and_remove_publicly_created(_self: Self, _note: &mut Note) {
        assert(
            false, "`assert_contains_and_remove_publicly_created` has been deprecated. Please call PXE.addNote() to add a note to the database. Then use PrivateSet.get_notes() in your contract to verify and remove a note."
        );
    }

    // docs:start:get_notes
    pub fn get_notes<N, M, FILTER_ARGS>(
        self,
        options: NoteGetterOptions<Note, N, M, FILTER_ARGS>
    ) -> [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] where Note: NoteInterface<N, M> {
        let storage_slot = self.storage_slot;
        let opt_notes = get_notes(self.context, storage_slot, options);

        assert(options.status == NoteStatus.ACTIVE, "PrivateSet can only retrieve active notes");

        // We immediately emit nullifiers for all notes read. An advanced user might wish to only use and nullify some
        // of them, but we don't allow for this use case to avoid scenarios in which they mistakenly don't nullify all
        // used notes.
        // These kinds of optimizations can be approximated regardless via usage of `NoteGetterOptions` by providing
        // appropriate filters, etc.
        for i in 0..opt_notes.len() {
            if opt_notes[i].is_some() {
                let note = opt_notes[i].unwrap_unchecked();
                destroy_note(self.context, note);
            }
        }

        opt_notes
    }
    // docs:end:get_notes
}

impl<Note> PrivateSet<Note, ()> {
    // docs:start:view_notes
    unconstrained pub fn view_notes<N, M>(
        self,
        options: NoteViewerOptions<Note, N, M>
    ) -> [Option<Note>; MAX_NOTES_PER_PAGE] where Note: NoteInterface<N, M> {
        view_notes(self.storage_slot, options)
    }
    // docs:end:view_notes
}
