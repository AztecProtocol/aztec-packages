use dep::aztec::{
    macros::notes::partial_note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::Serialize},
};

// docs:start:UintNote
// We derive the Serialize trait because in some cases notes are used as parameters to contract functions.
#[partial_note(quote {value})]
#[derive(Eq, Serialize)]
pub struct UintNote {
    // The amount of tokens in the note
    value: u128,
    owner: AztecAddress,
    // Randomness of the note to protect against note hash preimage attacks
    randomness: Field,
}
// docs:end:UintNote
impl UintNote {
    pub fn new(value: u128, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { value, owner, randomness }
    }

    pub fn get_value(self) -> u128 {
        self.value
    }
}
