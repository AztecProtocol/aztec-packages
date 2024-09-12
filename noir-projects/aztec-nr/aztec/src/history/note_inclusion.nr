use dep::protocol_types::merkle_tree::root::root_from_sibling_path;
use dep::protocol_types::header::Header;

use crate::{
    note::{utils::compute_note_hash_for_nullify, note_interface::{NoteInterface, NullifiableNote}},
    oracle::get_membership_witness::get_note_hash_membership_witness
};

trait ProveNoteInclusion {
    fn prove_note_inclusion<Note, N, M>(header: Header, note: Note) where Note: NoteInterface<N> + NullifiableNote;
}

impl ProveNoteInclusion for Header {
    fn prove_note_inclusion<Note, N, M>(self, note: Note) where Note: NoteInterface<N> + NullifiableNote {
        let note_hash = compute_note_hash_for_nullify(note);

        let witness = unsafe {
            get_note_hash_membership_witness(self.global_variables.block_number as u32, note_hash)
        };

        // Note inclusion is fairly straightforward, since all we need to prove is that a note exists in the note tree -
        // we don't even care _where_ in the tree it is stored. This is because entries in the note hash tree are
        // unique.
        assert_eq(
            self.state.partial.note_hash_tree.root, root_from_sibling_path(note_hash, witness.index, witness.path), "Proving note inclusion failed"
        );
    }
}
