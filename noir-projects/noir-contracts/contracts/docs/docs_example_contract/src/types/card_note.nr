use dep::aztec::{
    macros::notes::note,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}},
};

// docs:start:state_vars-CardNote
// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[note]
#[derive(Eq, Serialize, Deserialize)]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
// docs:end:state_vars-CardNote

impl CardNote {
    pub fn new(points: u8, randomness: Field, owner: AztecAddress) -> Self {
        CardNote { points, randomness, owner }
    }
}
