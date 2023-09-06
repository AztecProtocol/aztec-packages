
#[oracle(createNoteHash)]
fn create_note_hash_oracle(_note_hash: Field) -> Field {}

unconstrained fn create_note_hash(note_hash: Field) {
    assert(create_note_hash_oracle(note_hash) == 0);
}
