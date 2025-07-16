use dep::aztec::{
    macros::notes::note, oracle::random::random, protocol_types::address::AztecAddress,
};

#[note]
#[derive(Eq)]
pub struct SubscriptionNote {
    owner: AztecAddress,
    expiry_block_number: u32,
    remaining_txs: u32,
    // Randomness of the note to protect against note hash preimage attacks
    randomness: Field,
}

impl SubscriptionNote {
    pub fn new(owner: AztecAddress, expiry_block_number: u32, remaining_txs: u32) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { owner, expiry_block_number, remaining_txs, randomness }
    }
}
