use dep::aztec::{prelude::{NullifiableNote, PrivateContext}, macros::notes::note};

// TODO(benesjan): Once nuking this nuke hack in contract_artifact.ts
// This note has to have the same name as the standard `NFTNote` so that we get the same note type id.
#[note]
struct NFTNote {
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for NFTNote {
    fn compute_nullifier(self, _context: &mut PrivateContext, _note_hash_for_nullify: Field) -> Field {
        0
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        0
    }
}
