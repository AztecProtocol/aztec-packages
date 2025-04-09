use dep::aztec::{
    macros::notes::note, oracle::random::random, protocol_types::address::AztecAddress,
};

// docs:start:address_note_def
#[note]
#[derive(Eq)]
pub struct AddressNote {
    address: AztecAddress,
    owner: AztecAddress,
    randomness: Field,
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner: AztecAddress) -> Self {
        // Safety: we use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
        // malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        AddressNote { address, owner, randomness }
    }
}
// docs:end:address_note_def
