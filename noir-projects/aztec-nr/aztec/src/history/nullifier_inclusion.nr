use dep::protocol_types::block_header::BlockHeader;
use dep::protocol_types::merkle_tree::root::root_from_sibling_path;

use crate::{
    context::PrivateContext,
    note::{note_interface::{NoteInterface, NullifiableNote}, utils::compute_siloed_nullifier},
    oracle::get_nullifier_membership_witness::get_nullifier_membership_witness,
};

trait ProveNullifierInclusion {
    fn prove_nullifier_inclusion(header: BlockHeader, nullifier: Field);
}

impl ProveNullifierInclusion for BlockHeader {
    fn prove_nullifier_inclusion(self, nullifier: Field) {
        // 1) Get the membership witness of the nullifier
        /// Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
        let witness = unsafe {
            get_nullifier_membership_witness(self.global_variables.block_number as u32, nullifier)
        };

        // 2) First we prove that the tree leaf in the witness is present in the nullifier tree. This is expected to be
        // the leaf that contains the nullifier we're proving inclusion for.
        assert(
            self.state.partial.nullifier_tree.root
                == root_from_sibling_path(witness.leaf_preimage.hash(), witness.index, witness.path)
                ,
                "Proving nullifier inclusion failed",
            );

            // 3) Then we simply check that the value in the leaf is the expected one. Note that we don't need to perform
            // any checks on the rest of the values in the leaf preimage (the next index or next nullifier), since all we
            // care about is showing that the tree contains an entry with the expected nullifier.
            assert(
                witness.leaf_preimage.nullifier == nullifier,
                "Nullifier does not match value in witness",
            );
        }
}

trait ProveNoteIsNullified {
    fn prove_note_is_nullified<Note, let N: u32>(
        header: BlockHeader,
        note: Note,
        context: &mut PrivateContext,
    )
    where
        Note: NoteInterface<N> + NullifiableNote;
}

impl ProveNoteIsNullified for BlockHeader {
    // docs:start:prove_note_is_nullified
    fn prove_note_is_nullified<Note, let N: u32>(self, note: Note, context: &mut PrivateContext)
    where
        Note: NoteInterface<N> + NullifiableNote,
    {
        let nullifier = compute_siloed_nullifier(note, context);

        self.prove_nullifier_inclusion(nullifier);
    }
    // docs:end:prove_note_is_nullified
}
