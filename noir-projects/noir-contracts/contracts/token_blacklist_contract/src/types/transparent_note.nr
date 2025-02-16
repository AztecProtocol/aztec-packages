// docs:start:token_types_all
use dep::aztec::{
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    prelude::{NullifiableNote, PrivateContext, RetrievedNote},
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator, traits::Packable,
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
        note_hash_for_nullify: Field,
    ) -> Field {
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_without_context(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Field {
        // We set the note_hash_counter to 0 as the note is not transient and the concept of transient note does
        // not make sense in an unconstrained context.
        let retrieved_note =
            RetrievedNote { note: self, contract_address, nonce: note_nonce, note_hash_counter: 0 };
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
        // compute_nullifier ignores context so we can reuse it here
        self.compute_nullifier(zeroed(), note_hash_for_nullify)
    }
}

impl TransparentNote {
    // CONSTRUCTORS
    pub fn new(amount: Field, secret_hash: Field) -> Self {
        TransparentNote { amount, secret_hash }
    }
}

impl Eq for TransparentNote {
    fn eq(self, other: Self) -> bool {
        (self.amount == other.amount) & (self.secret_hash == other.secret_hash)
    }
}
// docs:end:token_types_all
