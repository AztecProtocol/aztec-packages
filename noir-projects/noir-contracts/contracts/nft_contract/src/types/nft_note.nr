use dep::aztec::{
    macros::notes::partial_note, oracle::random::random, protocol_types::address::AztecAddress,
};

// TODO(#12008): Remove the need for the manual import of `Packable` trait here. This is a bug in macros.
use aztec::protocol_types::traits::Packable;

// docs:start:nft_note
// Note: We don't need a custom note here. I am using it just to test the partial_custom_note macro.
#[partial_note(quote { token_id})]
#[derive(Eq)]
pub struct NFTNote {
    // ID of the token
    token_id: Field,
    // The owner of the note
    owner: AztecAddress,
    // Randomness of the note to protect against note hash preimage attacks
    randomness: Field,
}
// docs:end:nft_note

impl NFTNote {
    pub fn new(token_id: Field, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        NFTNote { token_id, owner, randomness }
    }
}
