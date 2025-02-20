use dep::aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    oracle::random::random,
    prelude::{NullifiableNote, PrivateContext, RetrievedNote},
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
    },
};

// TODO(#12008): Remove the need for the manual import of `Packable` trait here. This is a bug in macros.
use aztec::protocol_types::traits::Packable;

trait OwnedNote {
    fn new(amount: U128, owner: AztecAddress) -> Self;
    fn get_amount(self) -> U128;
}
// docs:start:TokenNote
#[note]
#[derive(Eq)]
pub struct TokenNote {
    // The amount of tokens in the note
    amount: U128,
    // The owner of the note
    owner: AztecAddress,
    // Randomness of the note to protect against note hash preimage attacks
    randomness: Field,
}
// docs:end:TokenNote

impl NullifiableNote for TokenNote {
    // docs:start:nullifier
    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
    // docs:end:nullifier

    unconstrained fn compute_nullifier_without_context(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Field {
        // We set the note_hash_counter to 0 as the note is assumed to be committed (and hence not transient).
        let retrieved_note =
            RetrievedNote { note: self, contract_address, nonce: note_nonce, note_hash_counter: 0 };
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER,
        )
    }
}

impl OwnedNote for TokenNote {
    fn new(amount: U128, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { amount, owner, randomness }
    }

    fn get_amount(self) -> U128 {
        self.amount
    }
}
