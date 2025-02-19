use dep::aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Serialize}};

// TODO(#12008): Remove the need for the manual import of `Packable` trait here. This is a bug in macros.
use aztec::protocol_types::traits::Packable;

// docs:start:state_vars-CardNote
global CARD_NOTE_LEN: u32 = 3; // 3 plus a header.

#[note]
#[derive(Eq)]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
// docs:end:state_vars-CardNote

// docs:start:cardnote_impl
impl CardNote {
    pub fn new(points: u8, randomness: Field, owner: AztecAddress) -> Self {
        CardNote { points, randomness, owner }
    }
}
// docs:end:cardnote_impl

// docs:start:serialize
impl Serialize<3> for CardNote {
    fn serialize(self) -> [Field; 3] {
        [self.points.to_field(), self.randomness, self.owner.to_field()]
    }
}
// docs:end:serialize
