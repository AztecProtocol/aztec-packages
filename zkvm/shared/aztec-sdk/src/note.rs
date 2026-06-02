use zkvm_data_types::field::Digest;
use serde::{Deserialize, Serialize};

/// Trait for note types. Contracts define their own note structs and implement
/// this trait to provide hash and nullifier computation.
pub trait NoteType<D: Digest>: Serialize + for<'de> Deserialize<'de> + Clone {
    /// Compute the note hash commitment.
    fn compute_note_hash(&self) -> D;

    /// Compute the nullifier that would destroy this note.
    fn compute_nullifier(&self, secret_key: &D) -> D;
}
