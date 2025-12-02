use aztec::{macros::notes::note, protocol_types::traits::{Deserialize, Packable, Serialize}};

// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct CardNote {
    points: u8,
}

impl CardNote {
    pub fn new(points: u8) -> Self {
        CardNote { points }
    }

    pub fn get_points(self) -> u8 {
        self.points
    }
}
