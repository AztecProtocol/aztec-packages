use aztec::{macros::notes::note, oracle::random::random, protocol_types::address::AztecAddress};

// docs:start:value-note-def
#[note]
#[derive(Eq)]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
// docs:end:value-note-def

impl ValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        ValueNote { value, owner, randomness }
    }

    pub fn value(self) -> Field {
        self.value
    }
}
