// docs:start:token_types_all
use dep::aztec::{
    macros::notes::note,
    note::{note_getter_options::PropertySelector, utils::compute_note_hash_for_nullify},
    prelude::{NoteHeader, NullifiableNote, PrivateContext},
    protocol_types::{
        constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator,
    },
};

use dep::std::mem::zeroed;

// Transparent note represents a note that is created in the clear (public execution), but can only be spent by those
// that know the preimage of the "secret_hash" (the secret). This is typically used when shielding a token balance.
// Owner of the tokens provides a "secret_hash" as an argument to the public "shield" function and then the tokens
// can be redeemed in private by presenting the preimage of the "secret_hash" (the secret).
#[note]
pub struct TransparentNote {
    amount: Field,
    secret_hash: Field,
}

impl NullifiableNote for TransparentNote {
    // Computing a nullifier in a transparent note is not guarded by making secret a part of the nullifier preimage (as
    // is common in other cases) and instead is guarded by the functionality of "redeem_shield" function. There we do
    // the following:
    //      1) We pass the secret as an argument to the function and use it to compute a secret hash,
    //      2) we fetch a note via the "get_notes" oracle which accepts the secret hash as an argument,
    //      3) the "get_notes" oracle constrains that the secret hash in the returned note matches the one computed in
    //         circuit.
    // This achieves that the note can only be spent by the party that knows the secret.
    fn compute_nullifier(
        self,
        _context: &mut PrivateContext,
        _note_hash_for_nullify: Field,
    ) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        // compute_nullifier ignores both of its parameters so we can reuse it here
        self.compute_nullifier(zeroed(), zeroed())
    }
}

impl TransparentNote {
    // CONSTRUCTORS
    pub fn new(amount: Field, secret_hash: Field) -> Self {
        TransparentNote { amount, secret_hash, header: NoteHeader::empty() }
    }
}

impl Eq for TransparentNote {
    fn eq(self, other: Self) -> bool {
        (self.amount == other.amount) & (self.secret_hash == other.secret_hash)
    }
}
// docs:end:token_types_all
