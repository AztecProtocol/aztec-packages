use crate::context::PrivateContext;
use crate::note::note_header::NoteHeader;

trait NoteInterface {
    fn compute_note_hash(self) -> Field;

    fn compute_nullifier(self) -> Field;

    fn get_header(self) -> NoteHeader;

    fn set_header(&mut self, header: NoteHeader) -> ();

    fn broadcast(self, context: &mut PrivateContext, slot: Field) -> ();
}

