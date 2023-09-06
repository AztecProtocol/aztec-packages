// Oracle function to get a note_hash, its sibling path and index, without getting its preimage.

// note_hash + index + root;
global NOTE_HASH_GETTER_LENGTH = 3;

#[oracle(getNoteHash)]
fn get_note_hash_oracle(_note_hash: Field) -> [Field; NOTE_HASH_GETTER_LENGTH] {}

unconstrained fn get_note_hash(note_hash: Field) -> [Field; NOTE_HASH_GETTER_LENGTH] {
    get_note_hash_oracle(note_hash)
}
