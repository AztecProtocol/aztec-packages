use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}

impl CardNote {
    pub fn new(points: u8, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        CardNote { points, randomness, owner }
    }

    pub fn get_points(self) -> u8 {
        self.points
    }
}
