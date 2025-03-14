use dep::aztec::{
    macros::notes::note, oracle::random::random, protocol_types::address::AztecAddress,
};

trait OwnedNote {
    fn new(amount: u128, owner: AztecAddress) -> Self;
    fn get_amount(self) -> u128;
}

#[note]
#[derive(Eq)]
pub struct TokenNote {
    // The amount of tokens in the note
    amount: u128,
    owner: AztecAddress,
    // Randomness of the note to protect against note hash preimage attacks
    randomness: Field,
}

impl OwnedNote for TokenNote {
    fn new(amount: u128, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { amount, owner, randomness }
    }

    fn get_amount(self) -> u128 {
        self.amount
    }
}
